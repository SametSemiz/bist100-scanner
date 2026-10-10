import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from bist_tickers import BIST_TICKERS

import threading

# Cache for yfinance downloads to reduce CPU and network usage
_yf_cache = {}
_yf_cache_lock = threading.Lock()

def cached_yf_download(tickers_str, period, interval, ttl_seconds=300):
    now = datetime.now()
    key = f"{tickers_str}_{period}_{interval}"
    
    with _yf_cache_lock:
        if key in _yf_cache:
            data, timestamp = _yf_cache[key]
            if (now - timestamp).total_seconds() < ttl_seconds:
                return data

    data = yf.download(tickers_str, period=period, interval=interval, progress=False, group_by='ticker', threads=True)
    
    with _yf_cache_lock:
        _yf_cache[key] = (data, now)
        
    return data

def calculate_bbawe(df: pd.DataFrame,
                    bb_length: int = 20,
                    bb_mult: float = 2.0,
                    fast_ma_len: int = 3,
                    ao_slow: int = 34,
                    ao_fast: int = 5,
                    sqz_length: int = 100,
                    sqz_threshold: int = 40,
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

    # RSI (14)
    rsi_length = 14
    change = df['Close'].diff()
    up = change.clip(lower=0)
    down = -change.clip(upper=0)
    rma_up = up.ewm(alpha=1/rsi_length, adjust=False).mean()
    rma_down = down.ewm(alpha=1/rsi_length, adjust=False).mean()
    rs = rma_up / rma_down
    df['rsi'] = 100 - (100 / (1 + rs))
    df['rsi'] = df['rsi'].fillna(100)
    
    # MFI (14)
    mfi_length = 14
    hlc3 = (df['High'] + df['Low'] + df['Close']) / 3
    raw_money_flow = hlc3 * df['Volume']
    hlc3_change = hlc3.diff()
    positive_flow = pd.Series(np.where(hlc3_change > 0, raw_money_flow, 0), index=df.index)
    negative_flow = pd.Series(np.where(hlc3_change < 0, raw_money_flow, 0), index=df.index)
    positive_mf_sum = positive_flow.rolling(window=mfi_length).sum()
    negative_mf_sum = negative_flow.rolling(window=mfi_length).sum()
    money_flow_ratio = positive_mf_sum / negative_mf_sum
    df['mfi'] = 100 - (100 / (1 + money_flow_ratio))
    df['mfi'] = df['mfi'].fillna(100)

    # Mavi Bulut durumu (Squeeze)
    df['in_blue_cloud'] = df['bb_squeeze'] <= sqz_threshold

    return df

def scan_bist100(timeframe: str, target_tickers=None, force_all=False):
    """Tüm BIST hisselerini çeker ve Mavi Bulut (Squeeze) şartını sağlayanları döndürür.
    Ayrıca her hisse için günlük yüzde değişimi, RSI ve MFI hesaplar.
    Eğer force_all True ise, mavi bulutta olmasa bile hisseyi döndürür."""
    # Yfinance için periyot ve interval ayarlaması
    if timeframe == '1h':
        interval = '1h'
        period = '3mo'
    elif timeframe == '1d':
        interval = '1d'
        period = '1y'
    else:
        # 2h ve 4h için 1h verisi alıp birleştireceğiz
        interval = '1h'
        period = '3mo'
    
    if target_tickers is None:
        target_tickers = BIST_TICKERS

    # Yfinance üzerinden çoklu veri çekimi
    tickers_str = " ".join(target_tickers)
    print(f"[{datetime.now()}] {len(target_tickers)} hisse için veri çekiliyor ({interval}, timeframe: {timeframe})...")
    
    try:
        data = cached_yf_download(tickers_str, period=period, interval=interval)
        
        if data.empty:
            return {"error": "Yahoo Finance veri vermeyi reddetti (Rate Limit veya IP Engeli). Lütfen birkaç dakika bekleyin."}
            
    except Exception as e:
        return {"error": f"Veri çekme hatası: {str(e)}"}

    # Günlük veri de çekelim (günlük % değişim hesabı için)
    # Eğer zaten 1d ise aynı datayı kullanırız
    daily_data = None
    if timeframe != '1d':
        try:
            daily_data = cached_yf_download(tickers_str, period='5d', interval='1d')
        except Exception:
            daily_data = None
    else:
        daily_data = data
        
    blue_cloud_stocks = []
    
    for ticker in target_tickers:
        try:
            # MultiIndex kontrolü
            if isinstance(data.columns, pd.MultiIndex):
                if ticker in data.columns.levels[0]:
                    df = data[ticker].dropna()
                else:
                    continue
            else:
                df = data.dropna()
                
            if len(df) < 100:
                continue
                
            # 2h veya 4h için resample işlemi
            if timeframe in ['2h', '4h']:
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
            
            # Günlük % değişim hesapla
            change_pct = 0.0
            prev_close = 0.0
            try:
                if daily_data is not None:
                    if isinstance(daily_data.columns, pd.MultiIndex):
                        if ticker in daily_data.columns.levels[0]:
                            daily_df = daily_data[ticker].dropna()
                        else:
                            daily_df = pd.DataFrame()
                    else:
                        daily_df = daily_data.dropna()
                    
                    if len(daily_df) >= 2:
                        current_close = float(daily_df['Close'].iloc[-1])
                        previous_close = float(daily_df['Close'].iloc[-2])
                        prev_close = previous_close
                        if previous_close > 0:
                            change_pct = ((current_close - previous_close) / previous_close) * 100
                    elif len(daily_df) == 1:
                        prev_close = float(daily_df['Close'].iloc[0])
            except Exception:
                pass
            
            if force_all or last_candle['in_blue_cloud']:
                close_price = float(last_candle['Close'])
                squeeze_val = float(last_candle['bb_squeeze'])
                
                # BBAWE oranı 0.0 olanları atla (hatalı veri)
                if round(squeeze_val, 1) == 0.0:
                    continue
                
                rsi_val = float(last_candle['rsi'])
                mfi_val = float(last_candle['mfi'])
                
                blue_cloud_stocks.append({
                    "symbol": ticker.replace(".IS", ""),
                    "price": round(close_price, 2),
                    "squeeze": round(squeeze_val, 2),
                    "change_pct": round(change_pct, 2),
                    "prev_close": round(prev_close, 2),
                    "rsi": round(rsi_val, 2),
                    "mfi": round(mfi_val, 2),
                    "in_blue_cloud": bool(last_candle['in_blue_cloud']),
                    "date": str(df_calc.index[-1])
                })
        except Exception as e:
            print(f"Hata ({ticker}): {e}")
            continue

    # Sıkışma oranına göre sırala
    blue_cloud_stocks.sort(key=lambda x: x['squeeze'])
    
    return {
        "count": len(blue_cloud_stocks),
        "total_scanned": len(target_tickers),
        "stocks": blue_cloud_stocks
    }


def scan_all_timeframes():
    """Tüm zaman dilimlerini tek seferde tarar ve sonuçları döndürür."""
    timeframes = ['1d', '4h', '2h', '1h']
    results = {}
    
    for tf in timeframes:
        print(f"[{datetime.now()}] {tf} zaman dilimi taranıyor...")
        result = scan_bist100(tf)
        results[tf] = result
        print(f"[{datetime.now()}] {tf} tamamlandı. {'Hata: ' + result.get('error', '') if 'error' in result else str(result.get('count', 0)) + ' hisse bulundu.'}")
    
    return results
