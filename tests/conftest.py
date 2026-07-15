import os
import tempfile

import pytest

from quantumbreach import create_app


@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app({"TESTING": True, "DB_PATH": db_path, "SECRET_KEY": "test"})
    yield app
    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_with_content():
    import os
    fixtures = os.path.join(os.path.dirname(__file__), "fixtures", "content")
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app({"TESTING": True, "DB_PATH": db_path, "SECRET_KEY": "test",
                      "CONTENT_DIR": fixtures})
    yield app
    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def content_client(app_with_content):
    return app_with_content.test_client()
