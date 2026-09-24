import express from 'express';
import cors from 'cors';
import router from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '4001', 10);

app.use(cors());
app.use(express.json());
app.use(router);

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'payment-gateway',
    event: 'server_started',
    port: PORT,
  }));
});
