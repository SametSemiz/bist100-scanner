import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        return None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        return None

def init_db():
    conn = get_db_connection()
    if not conn:
        print("Warning: No database connection available. Skipping init_db.")
        return
        
    try:
        cur = conn.cursor()
        # Create scan_cache table (only 1 row ever needed)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scan_cache (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create user_favorites table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_favorites (
                username VARCHAR(50) PRIMARY KEY,
                symbols JSONB NOT NULL
            )
        """)
        
        conn.commit()
        cur.close()
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        conn.close()

def save_scan_cache(data):
    conn = get_db_connection()
    if not conn:
        return
        
    try:
        cur = conn.cursor()
        # Delete old data
        cur.execute("DELETE FROM scan_cache")
        # Insert new data
        cur.execute(
            "INSERT INTO scan_cache (data, updated_at) VALUES (%s, CURRENT_TIMESTAMP)",
            (json.dumps(data, ensure_ascii=False),)
        )
        conn.commit()
        cur.close()
    except Exception as e:
        print(f"Error saving scan cache: {e}")
    finally:
        conn.close()

def get_scan_cache():
    conn = get_db_connection()
    if not conn:
        return None
        
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM scan_cache ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        cur.close()
        
        if row and row['data']:
            return row['data']
        return None
    except Exception as e:
        print(f"Error getting scan cache: {e}")
        return None
    finally:
        conn.close()

def get_user_favorites(username):
    conn = get_db_connection()
    if not conn:
        return []
        
    try:
        cur = conn.cursor()
        cur.execute("SELECT symbols FROM user_favorites WHERE username = %s", (username,))
        row = cur.fetchone()
        cur.close()
        
        if row and row[0]:
            return row[0]
        return []
    except Exception as e:
        print(f"Error getting favorites for {username}: {e}")
        return []
    finally:
        conn.close()

def save_user_favorites(username, symbols):
    conn = get_db_connection()
    if not conn:
        return
        
    try:
        cur = conn.cursor()
        # Upsert logic (Insert or Update)
        cur.execute("""
            INSERT INTO user_favorites (username, symbols) 
            VALUES (%s, %s)
            ON CONFLICT (username) DO UPDATE 
            SET symbols = EXCLUDED.symbols
        """, (username, json.dumps(symbols, ensure_ascii=False)))
        conn.commit()
        cur.close()
    except Exception as e:
        print(f"Error saving favorites for {username}: {e}")
    finally:
        conn.close()
