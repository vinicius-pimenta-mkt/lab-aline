import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os pacientes
router.get('/', verifyToken, async (req, res) => {
  try {
    const pacientes = await all('SELECT * FROM pacientes ORDER BY nome ASC');
    res.json(pacientes);
  } catch (error) {
    console.error('Erro ao listar pacientes:', error);
    res.status(500).json({ error: 'Erro ao listar pacientes' });
  }
});

// Obter paciente por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const paciente = await get('SELECT * FROM pacientes WHERE id = ?', [id]);
    
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente não encontrado' });
    }
    
    res.json(paciente);
  } catch (error) {
    console.error('Erro ao obter paciente:', error);
    res.status(500).json({ error: 'Erro ao obter paciente' });
  }
});

// Criar novo paciente
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      'INSERT INTO pacientes (nome, telefone, email, cpf, data_nascimento) VALUES (?, ?, ?, ?, ?)',
      [nome, telefone || null, email || null, cpf || null, data_nascimento || null]
    );

    res.status(201).json({
      message: 'Paciente criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar paciente:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao criar paciente' });
  }
});

// Atualizar paciente
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, email, cpf, data_nascimento } = req.body;

    const paciente = await get('SELECT * FROM pacientes WHERE id = ?', [id]);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente não encontrado' });
    }

    await query(
      'UPDATE pacientes SET nome = ?, telefone = ?, email = ?, cpf = ?, data_nascimento = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nome || paciente.nome, telefone || paciente.telefone, email || paciente.email, cpf || paciente.cpf, data_nascimento || paciente.data_nascimento, id]
    );

    res.json({ message: 'Paciente atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar paciente:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar paciente' });
  }
});

// Deletar paciente
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const paciente = await get('SELECT * FROM pacientes WHERE id = ?', [id]);
    if (!paciente) {
      return res.status(404).json({ error: 'Paciente não encontrado' });
    }

    await query('DELETE FROM pacientes WHERE id = ?', [id]);
    res.json({ message: 'Paciente deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar paciente:', error);
    res.status(500).json({ error: 'Erro ao deletar paciente' });
  }
});

export default router;
