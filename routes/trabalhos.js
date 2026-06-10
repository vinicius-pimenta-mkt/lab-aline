import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os trabalhos com filtros
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, data_inicio, data_fim, dentista_id, prioridade } = req.query;
    let queryText = `SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome 
                     FROM trabalhos t 
                     LEFT JOIN pacientes p ON t.paciente_id = p.id 
                     LEFT JOIN dentistas d ON t.dentista_id = d.id 
                     LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id`;
    const params = [];
    const conditions = [];

    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (data_inicio && data_fim) { conditions.push('t.data_entrada BETWEEN ? AND ?'); params.push(data_inicio, data_fim); }
    if (dentista_id) { conditions.push('t.dentista_id = ?'); params.push(dentista_id); }
    if (prioridade) { conditions.push('t.prioridade = ?'); params.push(prioridade); }
    
    if (conditions.length > 0) { queryText += ' WHERE ' + conditions.join(' AND '); }
    queryText += ' ORDER BY t.prioridade DESC, t.data_entrada DESC';

    const result = await all(queryText, params);
    res.json(result);
  } catch (error) {
    console.error('Erro ao listar trabalhos:', error);
    res.status(500).json({ error: 'Erro ao listar trabalhos' });
  }
});

// Obter trabalho por ID com etapas e custos
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const trabalho = await get(
      `SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome 
       FROM trabalhos t 
       LEFT JOIN pacientes p ON t.paciente_id = p.id 
       LEFT JOIN dentistas d ON t.dentista_id = d.id 
       LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id 
       WHERE t.id = ?`,
      [id]
    );
    
    if (!trabalho) {
      return res.status(404).json({ error: 'Trabalho não encontrado' });
    }

    // Obter etapas
    const etapas = await all('SELECT * FROM etapas WHERE trabalho_id = ? ORDER BY ordem ASC', [id]);
    
    // Obter custos
    const custos = await all('SELECT * FROM custos WHERE trabalho_id = ? ORDER BY data DESC', [id]);

    res.json({
      ...trabalho,
      etapas,
      custos
    });
  } catch (error) {
    console.error('Erro ao obter trabalho:', error);
    res.status(500).json({ error: 'Erro ao obter trabalho' });
  }
});

// Criar novo trabalho
router.post('/', verifyToken, async (req, res) => {
  try {
    const { paciente_id, dentista_id, tipo_protese_id, descricao, procedimento, data_entrada, prazo_entrega, prioridade, valor_bruto, forma_pagamento, resumo_trabalho, observacoes } = req.body;

    if (!paciente_id || !dentista_id || !descricao || !procedimento || !valor_bruto) {
      return res.status(400).json({ error: 'Campos obrigatórios: paciente_id, dentista_id, descricao, procedimento, valor_bruto' });
    }

    const result = await query(
      `INSERT INTO trabalhos (paciente_id, dentista_id, tipo_protese_id, descricao, procedimento, data_entrada, prazo_entrega, prioridade, valor_bruto, forma_pagamento, resumo_trabalho, observacoes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, dentista_id, tipo_protese_id || null, descricao, procedimento, data_entrada || new Date().toISOString().split('T')[0], prazo_entrega || null, prioridade || 'normal', valor_bruto, forma_pagamento || null, resumo_trabalho || null, observacoes || null]
    );

    res.status(201).json({
      message: 'Trabalho criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar trabalho:', error);
    res.status(500).json({ error: 'Erro ao criar trabalho' });
  }
});

// Atualizar trabalho
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao, procedimento, data_saida, status, valor_bruto, custo_operacional, prazo_entrega, prioridade, forma_pagamento, resumo_trabalho, observacoes } = req.body;

    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [id]);
    if (!trabalho) {
      return res.status(404).json({ error: 'Trabalho não encontrado' });
    }

    // Calcular lucro líquido
    const vb = valor_bruto || trabalho.valor_bruto;
    const co = custo_operacional || trabalho.custo_operacional;
    const lucro_liquido = vb - co;

    await query(
      `UPDATE trabalhos SET descricao = ?, procedimento = ?, data_saida = ?, status = ?, valor_bruto = ?, custo_operacional = ?, lucro_liquido = ?, prazo_entrega = ?, prioridade = ?, forma_pagamento = ?, resumo_trabalho = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [descricao || trabalho.descricao, procedimento || trabalho.procedimento, data_saida || trabalho.data_saida, status || trabalho.status, vb, co, lucro_liquido, prazo_entrega || trabalho.prazo_entrega, prioridade || trabalho.prioridade, forma_pagamento || trabalho.forma_pagamento, resumo_trabalho || trabalho.resumo_trabalho, observacoes || trabalho.observacoes, id]
    );

    res.json({ message: 'Trabalho atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar trabalho:', error);
    res.status(500).json({ error: 'Erro ao atualizar trabalho' });
  }
});

// Deletar trabalho
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [id]);
    if (!trabalho) {
      return res.status(404).json({ error: 'Trabalho não encontrado' });
    }

    // Deletar etapas, custos e anexos relacionados
    await query('DELETE FROM etapas WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM custos WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM anexos WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM trabalhos WHERE id = ?', [id]);

    res.json({ message: 'Trabalho deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar trabalho:', error);
    res.status(500).json({ error: 'Erro ao deletar trabalho' });
  }
});

export default router;
