import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDb } from './config/db.js';
import { initSocket } from './config/socket.js';

const port = process.env.PORT || 5000;

await connectDb();

const server = http.createServer(app);
initSocket(server);

server.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger UI running on http://localhost:${port}/api-docs`);
});
