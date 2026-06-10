import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar etapas de um trabalho
router.get('/trabalho/:trabalho_id', verifyToken, async (req, res) => {
  try {
    const { trabalho_id } = req.params;
    const etapas = await all('SELECT * FROM etapas WHERE trabalho_id = ? ORDER BY ordem ASC', [trabalho_id]);
    res.json(etapas);
  } catch (error) {
    console.error('Erro ao listar etapas:', error);
    res.status(500).json({ error: 'Erro ao listar etapas' });
  }
});

// Obter etapa por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const etapa = await get('SELECT * FROM etapas WHERE id = ?', [id]);
    
    if (!etapa) {
      return res.status(404).json({ error: 'Etapa não encontrada' });
    }
    
    res.json(etapa);
  } catch (error) {
    console.error('Erro ao obter etapa:', error);
    res.status(500).json({ error: 'Erro ao obter etapa' });
  }
});

// Criar nova etapa
router.post('/', verifyToken, async (req, res) => {
  try {
    const { trabalho_id, nome, descricao, ordem } = req.body;

    if (!trabalho_id || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios: trabalho_id, nome' });
    }

    const result = await query(
      'INSERT INTO etapas (trabalho_id, nome, descricao, ordem) VALUES (?, ?, ?, ?)',
      [trabalho_id, nome, descricao || null, ordem || 1]
    );

    res.status(201).json({
      message: 'Etapa criada com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar etapa:', error);
    res.status(500).json({ error: 'Erro ao criar etapa' });
  }
});

// Atualizar etapa
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, status, data_inicio, data_conclusao, ordem } = req.body;

    const etapa = await get('SELECT * FROM etapas WHERE id = ?', [id]);
    if (!etapa) {
      return res.status(404).json({ error: 'Etapa não encontrada' });
    }

    await query(
      'UPDATE etapas SET nome = ?, descricao = ?, status = ?, data_inicio = ?, data_conclusao = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nome || etapa.nome, descricao || etapa.descricao, status || etapa.status, data_inicio || etapa.data_inicio, data_conclusao || etapa.data_conclusao, ordem || etapa.ordem, id]
    );

    res.json({ message: 'Etapa atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar etapa:', error);
    res.status(500).json({ error: 'Erro ao atualizar etapa' });
  }
});

// Deletar etapa
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const etapa = await get('SELECT * FROM etapas WHERE id = ?', [id]);
    if (!etapa) {
      return res.status(404).json({ error: 'Etapa não encontrada' });
    }

    await query('DELETE FROM etapas WHERE id = ?', [id]);
    res.json({ message: 'Etapa deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar etapa:', error);
    res.status(500).json({ error: 'Erro ao deletar etapa' });
  }
});

export default router;
