import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar custos de um trabalho
router.get('/trabalho/:trabalho_id', verifyToken, async (req, res) => {
  try {
    const { trabalho_id } = req.params;
    const custos = await all('SELECT * FROM custos WHERE trabalho_id = ? ORDER BY data DESC', [trabalho_id]);
    res.json(custos);
  } catch (error) {
    console.error('Erro ao listar custos:', error);
    res.status(500).json({ error: 'Erro ao listar custos' });
  }
});

// Obter custo por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const custo = await get('SELECT * FROM custos WHERE id = ?', [id]);
    
    if (!custo) {
      return res.status(404).json({ error: 'Custo não encontrado' });
    }
    
    res.json(custo);
  } catch (error) {
    console.error('Erro ao obter custo:', error);
    res.status(500).json({ error: 'Erro ao obter custo' });
  }
});

// Criar novo custo
router.post('/', verifyToken, async (req, res) => {
  try {
    const { trabalho_id, descricao, tipo, valor, data, observacoes } = req.body;

    if (!trabalho_id || !descricao || !tipo || !valor) {
      return res.status(400).json({ error: 'Campos obrigatórios: trabalho_id, descricao, tipo, valor' });
    }

    const result = await query(
      'INSERT INTO custos (trabalho_id, descricao, tipo, valor, data, observacoes) VALUES (?, ?, ?, ?, ?, ?)',
      [trabalho_id, descricao, tipo, valor, data || new Date().toISOString().split('T')[0], observacoes || null]
    );

    // Atualizar custo_operacional do trabalho
    const custosTotais = await get('SELECT SUM(valor) as total FROM custos WHERE trabalho_id = ?', [trabalho_id]);
    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [trabalho_id]);
    const lucro_liquido = trabalho.valor_bruto - (custosTotais.total || 0);
    
    await query('UPDATE trabalhos SET custo_operacional = ?, lucro_liquido = ? WHERE id = ?', [custosTotais.total || 0, lucro_liquido, trabalho_id]);

    res.status(201).json({
      message: 'Custo criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar custo:', error);
    res.status(500).json({ error: 'Erro ao criar custo' });
  }
});

// Atualizar custo
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao, tipo, valor, data, observacoes } = req.body;

    const custo = await get('SELECT * FROM custos WHERE id = ?', [id]);
    if (!custo) {
      return res.status(404).json({ error: 'Custo não encontrado' });
    }

    await query(
      'UPDATE custos SET descricao = ?, tipo = ?, valor = ?, data = ?, observacoes = ? WHERE id = ?',
      [descricao || custo.descricao, tipo || custo.tipo, valor || custo.valor, data || custo.data, observacoes || custo.observacoes, id]
    );

    // Atualizar custo_operacional do trabalho
    const custosTotais = await get('SELECT SUM(valor) as total FROM custos WHERE trabalho_id = ?', [custo.trabalho_id]);
    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [custo.trabalho_id]);
    const lucro_liquido = trabalho.valor_bruto - (custosTotais.total || 0);
    
    await query('UPDATE trabalhos SET custo_operacional = ?, lucro_liquido = ? WHERE id = ?', [custosTotais.total || 0, lucro_liquido, custo.trabalho_id]);

    res.json({ message: 'Custo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar custo:', error);
    res.status(500).json({ error: 'Erro ao atualizar custo' });
  }
});

// Deletar custo
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const custo = await get('SELECT * FROM custos WHERE id = ?', [id]);
    if (!custo) {
      return res.status(404).json({ error: 'Custo não encontrado' });
    }

    await query('DELETE FROM custos WHERE id = ?', [id]);

    // Atualizar custo_operacional do trabalho
    const custosTotais = await get('SELECT SUM(valor) as total FROM custos WHERE trabalho_id = ?', [custo.trabalho_id]);
    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [custo.trabalho_id]);
    const lucro_liquido = trabalho.valor_bruto - (custosTotais.total || 0);
    
    await query('UPDATE trabalhos SET custo_operacional = ?, lucro_liquido = ? WHERE id = ?', [custosTotais.total || 0, lucro_liquido, custo.trabalho_id]);

    res.json({ message: 'Custo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar custo:', error);
    res.status(500).json({ error: 'Erro ao deletar custo' });
  }
});

export default router;
