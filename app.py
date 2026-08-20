import os
import sys
import types

# Ensure current directory is in sys.path
root_dir = os.path.abspath(os.path.dirname(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Override sys.modules['app'] to point to the app package directory, preventing app.py from shadowing the package
app_dir = os.path.join(root_dir, "app")
app_pkg = types.ModuleType("app")
app_pkg.__path__ = [app_dir]
app_pkg.__file__ = os.path.join(app_dir, "__init__.py")
sys.modules["app"] = app_pkg

import uvicorn
from app.main import app

if __name__ == "__main__":
    print("Starting AI Learning & Career Mentor Server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
