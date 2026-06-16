import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from bist_tickers import BIST_TICKERS

def calculate_bbawe(df: pd.DataFrame,
                    bb_length: int = 20,
                    bb_mult: float = 2.0,
                    fast_ma_len: int = 3,
                    ao_slow: int = 34,
                    ao_fast: int = 5,
                    sqz_length: int = 100,
                    sqz_threshold: int = 50,
                    bb_use_ema: bool = False) -> pd.DataFrame:
    """BBAWE indikatörünün tek bir hisse verisi için hesaplanması."""
    df = df.copy()
    if len(df) < sqz_length:
        return df

    # Fast MA
    df['fast_ma'] = df['Close'].ewm(span=fast_ma_len, adjust=False).mean()

    # BB Basis
    if bb_use_ema:
        df['bb_basis'] = df['Close'].ewm(span=bb_length, adjust=False).mean()
    else:
        df['bb_basis'] = df['Close'].rolling(window=bb_length).mean()

    # Bollinger Bands
    df['dev'] = df['Close'].rolling(window=bb_length).std(ddof=0)
    df['bb_upper'] = df['bb_basis'] + bb_mult * df['dev']
    df['bb_lower'] = df['bb_basis'] - bb_mult * df['dev']

    # Awesome Oscillator (AO)
    df['hl2'] = (df['High'] + df['Low']) / 2
    df['ao_fast_sma'] = df['hl2'].rolling(window=ao_fast).mean()
    df['ao_slow_sma'] = df['hl2'].rolling(window=ao_slow).mean()
    df['ao_val'] = df['ao_fast_sma'] - df['ao_slow_sma']
    
    # Squeeze
    df['spread'] = df['bb_upper'] - df['bb_lower']
    df['avgspread'] = df['spread'].rolling(window=sqz_length).mean()
    df['bb_squeeze'] = (df['spread'] / df['avgspread']) * 100

    # Mavi Bulut durumu (Squeeze)
    df['in_blue_cloud'] = df['bb_squeeze'] <= sqz_threshold

    return df

def scan_bist100(timeframe: str, chunk: str = "all"):
    """Tüm BIST hisselerini çeker ve Mavi Bulut (Squeeze) şartını sağlayanları döndürür."""
    # Yfinance için periyot ve interval ayarlaması
    if timeframe == '1h':
        interval = '1h'
        period = '3mo'  # 100 mum hesaplayabilmesi için yeterli geçmiş (Squeeze hesabı için gerekli)
    elif timeframe == '1d':
        interval = '1d'
        period = '1y'
    else:
        # 2h ve 4h için 1h verisi alıp birleştireceğiz
        interval = '1h'
        period = '3mo'
    
    # Chunk mantığı (Sadece seçilen aralıktaki hisseleri filtrele)
    target_tickers = BIST_TICKERS
    if chunk != "all":
        try:
            start_idx, end_idx = map(int, chunk.split("-"))
            target_tickers = BIST_TICKERS[start_idx:end_idx]
        except Exception:
            pass

    # Yfinance üzerinden çoklu veri çekimi
    tickers_str = " ".join(target_tickers)
    print(f"[{datetime.now()}] {len(target_tickers)} hisse için veri çekiliyor ({interval}, aralık: {chunk})...")
    
    try:
        data = yf.download(tickers_str, period=period, interval=interval, progress=False, group_by='ticker', threads=5)
        
        # Eğer veri boş dönerse (Yahoo IP'yi geçici engellemişse)
        if data.empty:
            return {"error": "Yahoo Finance veri vermeyi reddetti (Rate Limit veya IP Engeli). Lütfen birkaç dakika bekleyin veya daha az hisse seçin."}
            
    except Exception as e:
        return {"error": f"Veri çekme hatası: {str(e)}"}
        
    blue_cloud_stocks = []
    
    for ticker in target_tickers:
        try:
            # MultiIndex kontrolü (eğer sadece 1 hisse seçilirse MultiIndex dönmeyebilir)
            if isinstance(data.columns, pd.MultiIndex):
                if ticker in data.columns.levels[0]:
                    df = data[ticker].dropna()
                else:
                    continue
            else:
                # Sadece 1 hisse geldiyse
                df = data.dropna()
                
            if len(df) < 100:
                continue
                
            # 2h veya 4h için resample işlemi
            if timeframe in ['2h', '4h']:
                # Pandas resample ile mumları birleştir
                rule = '2h' if timeframe == '2h' else '4h'
                df = df.resample(rule).agg({
                    'Open': 'first',
                    'High': 'max',
                    'Low': 'min',
                    'Close': 'last',
                    'Volume': 'sum'
                }).dropna()
                
            if len(df) < 100:
                continue
                
            # İndikatörleri hesapla
            df_calc = calculate_bbawe(df)
            
            # Son mumu kontrol et
            last_candle = df_calc.iloc[-1]
            if last_candle['in_blue_cloud']:
                close_price = float(last_candle['Close'])
                squeeze_val = float(last_candle['bb_squeeze'])
                
                blue_cloud_stocks.append({
                    "symbol": ticker.replace(".IS", ""), # ".IS" uzantısını arayüz için temizle
                    "price": round(close_price, 2),
                    "squeeze": round(squeeze_val, 2),
                    "date": str(df_calc.index[-1])
                })
        except Exception as e:
            print(f"Hata ({ticker}): {e}")
            continue

    # Sıkışma oranına göre sırala (en sıkışık olan en üstte)
    blue_cloud_stocks.sort(key=lambda x: x['squeeze'])
    
    return {
        "count": len(blue_cloud_stocks),
        "total_scanned": len(target_tickers),
        "stocks": blue_cloud_stocks
    }
