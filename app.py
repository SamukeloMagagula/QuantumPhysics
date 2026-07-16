"""PhantomQ — run with: python app.py"""
import os

from quantumbreach import create_app
from quantumbreach.config import Config

app = create_app()


def main():
    port = Config.PORT
    print("=" * 56)
    print("  PhantomQ - running")
    print("=" * 56)
    print(f"  Open:  http://localhost:{port}")
    print("  Press Ctrl+C to stop.")
    print("=" * 56)
    if not os.environ.get("PHANTOMQ_SECRET_KEY"):
        print("  [warn] PHANTOMQ_SECRET_KEY not set - using a random key for this run.")
        print("         Logins reset on restart; set PHANTOMQ_SECRET_KEY to keep them.")
        print()
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
