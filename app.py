# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, session
from scanner import scan_bist100, scan_all_timeframes
from bist_tickers import BIST_TICKERS
from db import init_db, get_scan_cache, save_scan_cache
import json, os, threading
from datetime import datetime
import pytz

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'default-bist100-secret-key')

TZ = pytz.timezone('Europe/Istanbul')
_lock = threading.Lock()
_scanning = False  # Tarama devam ediyor mu

# DB Init at startup
init_db()


def _get_cache():
    """DB üzerinden cache'i okur."""
    return get_scan_cache()

def _save_cache(data):
    """DB üzerine cache'i yazar."""
    save_scan_cache(data)


def update_tracking_and_diff(cached, timeframe, new_stocks_data):
    now_date = datetime.now(TZ).strftime("%Y-%m-%d")
    
    if "tracking" not in cached:
        cached["tracking"] = {}
        
    track = cached["tracking"].get(timeframe, {})
    
    # Eski formattan yeni formata geçiş veya ilk kurulum
    if "current_date" not in track:
        track = {
            "current_date": now_date,
            "previous_symbols": [],
            "current_symbols": [s['symbol'] for s in new_stocks_data],
            "stock_data_map": {s['symbol']: s for s in new_stocks_data}
        }
    else:
        last_date = track.get("current_date", now_date)
        
        if last_date != now_date:
            # Gün değiştiğinde, dünün 'current_symbols' listesi 'previous_symbols' olur
            track["previous_symbols"] = track.get("current_symbols", [])
            track["current_date"] = now_date
            
        # Güncel sembolleri kaydet
        track["current_symbols"] = [s['symbol'] for s in new_stocks_data]
        
        # Düşen hisselerin verilerini gösterebilmek için stock_data_map'i güncelle
        if "stock_data_map" not in track:
            track["stock_data_map"] = {}
        for s in new_stocks_data:
            track["stock_data_map"][s['symbol']] = s

    # Önceki gün ile bugünün karşılaştırması
    prev_set = set(track.get("previous_symbols", []))
    curr_set = set(track.get("current_symbols", []))
    
    entered_symbols = list(curr_set - prev_set)
    dropped_symbols = list(prev_set - curr_set)
    
    dropped_stocks = []
    for sym in dropped_symbols:
        if sym in track.get("stock_data_map", {}):
            dropped_stocks.append(track["stock_data_map"][sym])
            
    cached["tracking"][timeframe] = track
    return entered_symbols, dropped_stocks


def _do_full_scan():
    """Tüm zaman dilimlerini tarar ve cache'e yazar."""
    global _scanning
    _scanning = True
    try:
        now = datetime.now(TZ)
        results = scan_all_timeframes()
        cached = _get_cache() or {"results": {}, "tracking": {}}
        
        for tf, result in results.items():
            if "error" not in result:
                entered, dropped = update_tracking_and_diff(cached, tf, result.get("stocks", []))
                result["entered_symbols"] = entered
                result["dropped_stocks"] = dropped
                cached["results"][tf] = result
            else:
                cached["results"][tf] = result

        cached["last_updated"] = now.strftime('%Y-%m-%dT%H:%M:%S+03:00')
        cached["last_updated_display"] = now.strftime('%d.%m.%Y %H:%M')
        _save_cache(cached)
        return cached
    finally:
        _scanning = False


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/tickers', methods=['GET'])
def get_tickers():
    return jsonify([t.replace(".IS", "") for t in BIST_TICKERS])


@app.route('/api/results', methods=['GET'])
def get_results():
    """Cache'deki sonuçları döndürür."""
    cached = _get_cache()
    if cached is None:
        return jsonify({
            "status": "no_data",
            "message": "Henüz tarama yapılmadı. Manuel güncelleme yapın."
        })
    return jsonify({
        "status": "success",
        "data": cached
    })


@app.route('/api/scan_timeframe', methods=['POST'])
def scan_single_timeframe():
    """Tek bir zaman dilimini tarar ve sonucu döndürür.
    Vercel timeout'unu aşmamak için her seferinde tek timeframe taranır."""
    try:
        data = request.json
        timeframe = data.get('timeframe', '1d')
        
        result = scan_bist100(timeframe)
        
        if "error" in result:
            return jsonify({"status": "error", "message": result["error"]}), 500
        
        # Mevcut cache'i oku ve bu timeframe'i güncelle
        cached = _get_cache() or {"results": {}, "tracking": {}}
        now = datetime.now(TZ)
        
        entered, dropped = update_tracking_and_diff(cached, timeframe, result.get("stocks", []))
        result["entered_symbols"] = entered
        result["dropped_stocks"] = dropped
        
        cached["results"][timeframe] = result
        cached["last_updated"] = now.strftime('%Y-%m-%dT%H:%M:%S+03:00')
        cached["last_updated_display"] = now.strftime('%d.%m.%Y %H:%M')
        _save_cache(cached)
        
        return jsonify({
            "status": "success",
            "timeframe": timeframe,
            "data": result,
            "last_updated_display": cached["last_updated_display"]
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/scan_specific', methods=['POST'])
def scan_specific():
    """Özel hisseleri tarayıp sonucu döndürür."""
    try:
        data = request.json
        timeframe = data.get('timeframe', '1d')
        tickers = data.get('tickers', [])
        
        if not tickers:
            return jsonify({"status": "error", "message": "En az bir hisse seçmelisiniz."}), 400
            
        # Add .IS suffix for yfinance
        target_tickers = [f"{t}.IS" for t in tickers]
        
        result = scan_bist100(timeframe, target_tickers=target_tickers, force_all=True)
        
        if "error" in result:
            return jsonify({"status": "error", "message": result["error"]}), 500
            
        return jsonify({
            "status": "success",
            "timeframe": timeframe,
            "data": result
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/favorites', methods=['GET', 'POST'])
def manage_favorites():
    """Önbellek tabanlı favoriler için geriye dönük uyumlu uç nokta."""
    return jsonify({"status": "success", "favorites": []})

@app.route('/api/status', methods=['GET'])
def scan_status():
    """Tarama durumunu kontrol eder."""
    return jsonify({
        "scanning": _scanning
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
