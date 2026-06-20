import express from 'express';
import { all, query, get } from '../database/database.js'; // <-- Adicionado o 'get' aqui
import jwt from 'jsonwebtoken';

const router = express.Router();

// ==========================================
// MIDDLEWARE DE SEGURANÇA
// ==========================================
const verifyTsbToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto_padrao');
    if (decoded.role !== 'tsb') return res.status(401).json({ error: 'Acesso não autorizado para a Clínica' });
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
};

// ==========================================
// 1. ROTA DE LOGIN EXCLUSIVA DO TSB
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const tsbUser = process.env.TSB_USER || 'aline';
    const tsbPass = process.env.TSB_PASS || 'tsb123';

    if (username === tsbUser && password === tsbPass) {
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
// 2. ROTAS DO SISTEMA DE PACIENTES
// ==========================================
router.get('/', verifyTsbToken, async (req, res) => {
  try {
    const pacientes = await all('SELECT * FROM tsb_pacientes ORDER BY proximo_atendimento ASC');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar pacientes TSB' });
  }
});

router.post('/', verifyTsbToken, async (req, res) => {
  try {
    const { nome, telefone, procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento } = req.body;
    if (!nome || !ultimo_atendimento || !proximo_atendimento) return res.status(400).json({ error: 'Nome e datas são obrigatórios' });

    const result = await query(
      'INSERT INTO tsb_pacientes (nome, telefone, procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, telefone || null, procedimento || 'Limpeza Padrão', recorrencia_meses || 4, data_inicio, ultimo_atendimento, proximo_atendimento]
    );
    res.status(201).json({ message: 'Paciente TSB cadastrado', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar paciente TSB' });
  }
});

// ==========================================
// 3. NOVAS ROTAS: RENOVAR E APAGAR
// ==========================================

// Rota para Renovar 1 Clique
router.put('/:id/renovar', verifyTsbToken, async (req, res) => {
  try {
    const { id } = req.params;
    const paciente = await get('SELECT * FROM tsb_pacientes WHERE id = ?', [id]);
    if (!paciente) return res.status(404).json({ error: 'Paciente não encontrado' });

    // Pega a data que era o "Próximo" e transforma em "Último Atendimento"
    const dataUltimo = new Date(paciente.proximo_atendimento + 'T00:00:00');
    
    // Calcula o novo "Próximo Atendimento" somando os meses de recorrência
    const dataProximo = new Date(dataUltimo);
    dataProximo.setMonth(dataProximo.getMonth() + paciente.recorrencia_meses);

    const novoUltimoStr = dataUltimo.toISOString().split('T')[0];
    const novoProximoStr = dataProximo.toISOString().split('T')[0];

    await query(
      'UPDATE tsb_pacientes SET ultimo_atendimento = ?, proximo_atendimento = ? WHERE id = ?',
      [novoUltimoStr, novoProximoStr, id]
    );

    res.json({ message: 'Atendimento renovado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao renovar paciente' });
  }
});

// Rota para Apagar Paciente
router.delete('/:id', verifyTsbToken, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM tsb_pacientes WHERE id = ?', [id]);
    res.json({ message: 'Paciente removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover paciente' });
  }
});

export default router;
