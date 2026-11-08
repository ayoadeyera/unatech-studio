# unatech-studio
AI-assisted video production studio for educational content

## Local development

Run the Express API and Vite client in separate terminals:

```powershell
cd server
npm install
npm start
```

```powershell
cd client
npm install
npm run dev
```

The client uses same-origin `/api` requests and Vite proxies them to
`http://127.0.0.1:5000` by default. Check `http://127.0.0.1:5000/api/health`
for the backend health response. If Express uses another port, set
`VITE_API_PROXY_TARGET` for Vite (for example,
`http://127.0.0.1:5001`). Set `VITE_API_URL` only when the frontend should
call a separately hosted API directly.
