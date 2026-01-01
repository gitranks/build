# The tests of the task API, run with Python's own runner: python3 -m unittest (python -m unittest on Windows)
import http.client
import json
import subprocess
import sys
import unittest


class TasksTest(unittest.TestCase):
    # Before each test, a server of its own on a free port: no test sees another's tasks. It stops after the test.
    def setUp(self):
        self.server = subprocess.Popen([sys.executable, "server.py", "--port", "0"], stdout=subprocess.PIPE, encoding="utf-8")
        self.addCleanup(self.server.stdout.close)
        self.addCleanup(self.server.wait)
        self.addCleanup(self.server.kill)
        port = int(self.server.stdout.readline().split(":")[-1])  # its first line: web: listening on http://localhost:52731
        self.connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        self.addCleanup(self.connection.close)

    # Send a request, and read the answer: its status code, and its body as JSON.
    def call(self, method, path, body=None):
        self.connection.request(method, path, None if body is None else json.dumps(body))
        answer = self.connection.getresponse()
        data = answer.read()
        return answer.status, json.loads(data) if data else None

    def test_create_a_task(self):
        status, body = self.call("POST", "/api/tasks", {"title": "Buy milk"})
        self.assertEqual(status, 201)
        self.assertEqual(body, {"id": 1, "title": "Buy milk", "done": False})

    def test_refuse_a_task_with_no_title(self):
        status, body = self.call("POST", "/api/tasks", {"done": True})
        self.assertEqual(status, 400)
        self.assertEqual(body["field"], "title")

    def test_answer_404_for_a_task_that_is_not_there(self):
        status, body = self.call("GET", "/api/tasks/7")
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "no task with id 7")

    def test_list_the_tasks(self):
        self.call("POST", "/api/tasks", {"title": "Buy milk"})
        self.call("POST", "/api/tasks", {"title": "Call Grace", "done": True})
        body = self.call("GET", "/api/tasks")[1]
        self.assertEqual([task["title"] for task in body], ["Buy milk", "Call Grace"])

    def test_change_a_task_then_delete_it(self):
        self.call("POST", "/api/tasks", {"title": "Buy milk"})
        self.assertEqual(self.call("PATCH", "/api/tasks/1", {"done": True})[1], {"id": 1, "title": "Buy milk", "done": True})
        self.assertEqual(self.call("DELETE", "/api/tasks/1")[0], 204)
        self.assertEqual(self.call("GET", "/api/tasks/1")[0], 404)
