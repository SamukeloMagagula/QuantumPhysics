def _signup(client, name="rae"):
    client.post("/auth/signup", data={"username": name, "password": "pw12"})


def test_room_page_renders_tasks_and_widget(content_client):
    _signup(content_client)
    html = content_client.get("/rooms/demo-room").get_data(as_text=True)
    assert "Demo Room" in html
    assert 'data-widget="caesar-wheel"' in html
    assert 'data-question="q1"' in html
    assert "js/app.js" in html
    assert "js/widgets/caesar-wheel.js" in html
    # Scripts must render exactly once. A nested {% block scripts %} inside
    # {% block content %} would double-emit app.js (double event listeners).
    assert html.count("js/app.js") == 1
    assert html.count("js/widgets/caesar-wheel.js") == 1


def test_path_page_renders(content_client):
    html = content_client.get("/paths/demo").get_data(as_text=True)
    assert "Demo Path" in html
    assert "Demo Room" in html
