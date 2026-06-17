import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importar rotas
import authRoutes from './routes/auth.js';
import dentistasRoutes from './routes/dentistas.js';
import pacientesRoutes from './routes/pacientes.js';
import trabalhosRoutes from './routes/trabalhos.js';
import etapasRoutes from './routes/etapas.js';
import custosRoutes from './routes/custos.js';
import relatoriosRoutes from './routes/relatorios.js';
import tiposProtesesRoutes from './routes/tipos-protese.js';
import servicosPadraoRoutes from './routes/servicos-padrao.js';
import pdfRoutes from './routes/pdf.js';
import anexosRoutes from './routes/anexos.js';
import motoboysRoutes from './routes/motoboys.js';

// Importar inicialização do banco
import { initDatabase } from './database/database.js';

// Carregar variáveis de ambiente
dotenv.config();

console.log('--- Iniciando Servidor LabPro ---');
console.log('Ambiente:', process.env.NODE_ENV);
console.log('Porta:', process.env.PORT || 3001);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: '*', 
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API LabPro - Gestão de Laboratório de Prótese Dentária funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/dentistas', dentistasRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/trabalhos', trabalhosRoutes);
app.use('/api/etapas', etapasRoutes);
app.use('/api/custos', custosRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/tipos-protese', tiposProtesesRoutes);
app.use('/api/servicos-padrao', servicosPadraoRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/anexos', anexosRoutes);
app.use('/api/motoboys', motoboysRoutes);

// Rota 404 para APIs não encontradas
app.use('*', (req, res) => {
  console.log(`404 - Rota não encontrada: ${req.originalUrl}`);
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Inicializar banco de dados e servidor
const startServer = async () => {
  try {
    console.log('Inicializando banco de dados...');
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API rodando na porta ${PORT}`);
      console.log('Servidor pronto para receber requisições.');
    });
  } catch (error) {
    console.error('ERRO CRÍTICO ao inicializar servidor:', error);
    process.exit(1);
  }
};

// Lógica de inicialização para Easypanel/Docker vs Vercel
if (process.env.VERCEL || process.env.NOW_REGION) {
  console.log('Detectado ambiente Vercel/Serverless');
  initDatabase().catch(err => console.error('Erro Vercel Init:', err));
} else {
  console.log('Detectado ambiente de Servidor (Easypanel/Docker/Local)');
  startServer();
}

export default app;
