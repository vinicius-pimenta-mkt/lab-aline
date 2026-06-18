import express from 'express';
import { all, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

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
