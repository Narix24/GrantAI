import os
import requests
import subprocess
import importlib

# 1. Check Python imports
def check_imports():
    print("Checking imports...")
    try:
        subprocess.run(["flake8", "."], check=False)
    except Exception as e:
        print("Error running flake8:", e)

# 2. Check external URLs
def check_urls(base_path: str = "."):
    print("\nChecking external links...")
    for root, _, files in os.walk(base_path):
        for f in files:
            if f.endswith((".py", ".md", ".html", ".txt")):
                with open(os.path.join(root, f), errors="ignore") as file:
                    for line in file:
                        if "http" in line:
                            urls = [word for word in line.split() if word.startswith("http")]
                            for url in urls:
                                try:
                                    r = requests.head(url, timeout=5)
                                    if r.status_code >= 400:
                                        print(f"[BAD LINK] {url} -> {r.status_code}")
                                except Exception as e:
                                    print(f"[ERROR] {url} -> {e}")

# 3. Check missing dependencies
def check_dependencies():
    print("\nChecking dependencies...")
    with open("requirements.txt", "r") as req:
        for line in req:
            pkg = line.strip().split("==")[0]
            if not pkg:
                continue
            try:
                importlib.import_module(pkg)
            except ImportError:
                print(f"[MISSING] {pkg}")

if __name__ == "__main__":
    print("Running full project check...\n")
    check_imports()
    check_urls()
    check_dependencies()
    print("\n✅ Scan complete. Fix manually or auto-install missing dependencies.")