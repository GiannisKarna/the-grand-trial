from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def hello_dimitris():
    return {"message": "Hello Dimitris!", "status": "success"}

@app.get("/users")
def get_users():
    users = [
        {"id": 1, "name": "Dimitris"},
        {"id": 2, "name": "Maria"},
        {"id": 3, "name": "John"}
    ]
    return {"users": users, "status": "success"}