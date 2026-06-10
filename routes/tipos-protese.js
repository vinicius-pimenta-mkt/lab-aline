import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os tipos de prótese
router.get('/', verifyToken, async (req, res) => {
  try {
    const tipos = await all('SELECT * FROM tipos_protese ORDER BY nome ASC');
    res.json(tipos);
  } catch (error) {
    console.error('Erro ao listar tipos de prótese:', error);
    res.status(500).json({ error: 'Erro ao listar tipos de prótese' });
  }
});

// Obter tipo de prótese por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tipo = await get('SELECT * FROM tipos_protese WHERE id = ?', [id]);
    
    if (!tipo) {
      return res.status(404).json({ error: 'Tipo de prótese não encontrado' });
    }
    
    res.json(tipo);
  } catch (error) {
    console.error('Erro ao obter tipo de prótese:', error);
    res.status(500).json({ error: 'Erro ao obter tipo de prótese' });
  }
});

// Criar novo tipo de prótese
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nome, descricao, valor_padrao, tempo_medio_dias } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      'INSERT INTO tipos_protese (nome, descricao, valor_padrao, tempo_medio_dias) VALUES (?, ?, ?, ?)',
      [nome, descricao || null, valor_padrao || null, tempo_medio_dias || 7]
    );

    res.status(201).json({
      message: 'Tipo de prótese criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar tipo de prótese:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tipo de prótese já existe' });
    }
    res.status(500).json({ error: 'Erro ao criar tipo de prótese' });
  }
});

// Atualizar tipo de prótese
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, valor_padrao, tempo_medio_dias } = req.body;

    const tipo = await get('SELECT * FROM tipos_protese WHERE id = ?', [id]);
    if (!tipo) {
      return res.status(404).json({ error: 'Tipo de prótese não encontrado' });
    }

    await query(
      'UPDATE tipos_protese SET nome = ?, descricao = ?, valor_padrao = ?, tempo_medio_dias = ? WHERE id = ?',
      [nome || tipo.nome, descricao || tipo.descricao, valor_padrao || tipo.valor_padrao, tempo_medio_dias || tipo.tempo_medio_dias, id]
    );

    res.json({ message: 'Tipo de prótese atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar tipo de prótese:', error);
    res.status(500).json({ error: 'Erro ao atualizar tipo de prótese' });
  }
});

// Deletar tipo de prótese
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tipo = await get('SELECT * FROM tipos_protese WHERE id = ?', [id]);
    if (!tipo) {
      return res.status(404).json({ error: 'Tipo de prótese não encontrado' });
    }

    await query('DELETE FROM tipos_protese WHERE id = ?', [id]);
    res.json({ message: 'Tipo de prótese deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar tipo de prótese:', error);
    res.status(500).json({ error: 'Erro ao deletar tipo de prótese' });
  }
});

export default router;
