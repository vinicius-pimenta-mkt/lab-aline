import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// ==========================================
// 1. ROTA DE LOGIN EXCLUSIVA DO TSB
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Credenciais de acesso exclusivas da Clínica (Pode alterar como quiser aqui)
    const tsbUser = process.env.TSB_USER || 'aline';
    const tsbPass = process.env.TSB_PASS || 'tsb123';

    if (username === tsbUser && password === tsbPass) {
      // Gera um token específico para o TSB válido por 7 dias
      const token = jwt.sign(
        { id: 999, username: tsbUser, role: 'tsb' }, 
        process.env.JWT_SECRET || 'secreto_padrao', 
        { expiresIn: '7d' }
      );
      return res.json({ token, user: { username: tsbUser, role: 'tsb' } });
    }

    return res.status(401).json({ error: 'Usuário ou senha incorretos para a Clínica TSB.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer login no TSB' });
  }
});

// ==========================================
// 2. ROTAS DO SISTEMA (Protegidas)
// ==========================================
// Listar todos os pacientes de TSB
router.get('/', verifyToken, async (req, res) => {
  try {
    const pacientes = await all('SELECT * FROM tsb_pacientes ORDER BY proximo_atendimento ASC');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar pacientes TSB' });
  }
});

// Cadastrar novo paciente TSB
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, telefone, procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento } = req.body;
    
    if (!nome || !ultimo_atendimento || !proximo_atendimento) {
      return res.status(400).json({ error: 'Nome e datas são obrigatórios' });
    }

    const result = await query(
      'INSERT INTO tsb_pacientes (nome, telefone, procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, telefone || null, procedimento || 'Limpeza Padrão', recorrencia_meses || 4, data_inicio, ultimo_atendimento, proximo_atendimento]
    );

    res.status(201).json({ message: 'Paciente TSB cadastrado', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar paciente TSB' });
  }
});

export default router;
