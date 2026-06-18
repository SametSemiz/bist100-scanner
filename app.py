# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify
from scanner import scan_bist100
from bist_tickers import BIST_TICKERS

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tickers', methods=['GET'])
def get_tickers():
    return jsonify([t.replace(".IS", "") for t in BIST_TICKERS])

@app.route('/scan', methods=['POST'])
def run_scan():
    try:
        data = request.json
        timeframe = data.get('timeframe', '1d')
        chunk = data.get('chunk', 'all')
        selected_tickers = data.get('selected_tickers', [])
        
        results = scan_bist100(timeframe, chunk, selected_tickers)
        
        if "error" in results:
            return jsonify({"status": "error", "message": results["error"]}), 500
            
        return jsonify({
            "status": "success",
            "data": results
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
