"""Start the isolated city. No background scheduler or income timer exists."""
import uvicorn

if __name__ == '__main__':
    uvicorn.run('backend.app:app', host='127.0.0.1', port=8766, reload=False)
