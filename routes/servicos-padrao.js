import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os serviços padrão
router.get('/', verifyToken, async (req, res) => {
  try {
    const servicos = await all(
      `SELECT s.*, t.nome as tipo_protese_nome 
       FROM servicos_padrao s 
       LEFT JOIN tipos_protese t ON s.tipo_protese_id = t.id 
       WHERE s.ativo = 1 
       ORDER BY s.nome ASC`
    );
    res.json(servicos);
  } catch (error) {
    console.error('Erro ao listar serviços padrão:', error);
    res.status(500).json({ error: 'Erro ao listar serviços padrão' });
  }
});

// Obter serviço padrão por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const servico = await get(
      `SELECT s.*, t.nome as tipo_protese_nome 
       FROM servicos_padrao s 
       LEFT JOIN tipos_protese t ON s.tipo_protese_id = t.id 
       WHERE s.id = ?`,
      [id]
    );
    
    if (!servico) {
      return res.status(404).json({ error: 'Serviço padrão não encontrado' });
    }
    
    res.json(servico);
  } catch (error) {
    console.error('Erro ao obter serviço padrão:', error);
    res.status(500).json({ error: 'Erro ao obter serviço padrão' });
  }
});

// Criar novo serviço padrão
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, tipo_protese_id, descricao, valor_padrao, tempo_medio_dias } = req.body;

    if (!nome || !valor_padrao) {
      return res.status(400).json({ error: 'Nome e valor_padrao são obrigatórios' });
    }

    const result = await query(
      'INSERT INTO servicos_padrao (nome, tipo_protese_id, descricao, valor_padrao, tempo_medio_dias) VALUES (?, ?, ?, ?, ?)',
      [nome, tipo_protese_id || null, descricao || null, valor_padrao, tempo_medio_dias || 7]
    );

    res.status(201).json({
      message: 'Serviço padrão criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar serviço padrão:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Serviço padrão já existe' });
    }
    res.status(500).json({ error: 'Erro ao criar serviço padrão' });
  }
});

// Atualizar serviço padrão
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, tipo_protese_id, descricao, valor_padrao, tempo_medio_dias, ativo } = req.body;

    const servico = await get('SELECT * FROM servicos_padrao WHERE id = ?', [id]);
    if (!servico) {
      return res.status(404).json({ error: 'Serviço padrão não encontrado' });
    }

    await query(
      'UPDATE servicos_padrao SET nome = ?, tipo_protese_id = ?, descricao = ?, valor_padrao = ?, tempo_medio_dias = ?, ativo = ? WHERE id = ?',
      [nome || servico.nome, tipo_protese_id || servico.tipo_protese_id, descricao || servico.descricao, valor_padrao || servico.valor_padrao, tempo_medio_dias || servico.tempo_medio_dias, ativo !== undefined ? ativo : servico.ativo, id]
    );

    res.json({ message: 'Serviço padrão atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar serviço padrão:', error);
    res.status(500).json({ error: 'Erro ao atualizar serviço padrão' });
  }
});

// Deletar serviço padrão (soft delete - apenas marca como inativo)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const servico = await get('SELECT * FROM servicos_padrao WHERE id = ?', [id]);
    if (!servico) {
      return res.status(404).json({ error: 'Serviço padrão não encontrado' });
    }

    await query('UPDATE servicos_padrao SET ativo = 0 WHERE id = ?', [id]);
    res.json({ message: 'Serviço padrão deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar serviço padrão:', error);
    res.status(500).json({ error: 'Erro ao deletar serviço padrão' });
  }
});

export default router;
