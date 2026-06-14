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

    const etapas = await all('SELECT * FROM etapas WHERE trabalho_id = ? ORDER BY ordem ASC', [id]);
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

// Criar novo trabalho (SISTEMA INTEGRADO E BLINDADO)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      paciente_nome, 
      dentista_nome, 
      tipo_protese_id, 
      descricao, 
      procedimento, 
      data_entrada, 
      prazo_entrega, 
      prioridade, 
      valor_bruto, 
      custo_operacional,
      forma_pagamento, 
      resumo_trabalho, 
      observacoes 
    } = req.body;

    // Validação de segurança dos campos textuais obrigatórios
    if (!paciente_nome || !dentista_nome || !procedimento || !valor_bruto) {
      return res.status(400).json({ error: 'Campos obrigatórios: paciente_nome, dentista_nome, procedimento, valor_bruto' });
    }

    // 1. Verificar ou Criar o Paciente dinamicamente
    let paciente = await get('SELECT id FROM pacientes WHERE nome = ?', [paciente_nome.trim()]);
    let paciente_id;
    if (paciente) {
      paciente_id = paciente.id;
    } else {
      const resPac = await query('INSERT INTO pacientes (nome) VALUES (?)', [paciente_nome.trim()]);
      paciente_id = resPac.lastID;
    }

    // 2. Verificar ou Criar o Dentista dinamicamente
    let dentista = await get('SELECT id FROM dentistas WHERE nome = ?', [dentista_nome.trim()]);
    let dentista_id;
    if (dentista) {
      dentista_id = dentista.id;
    } else {
      const resDent = await query('INSERT INTO dentistas (nome) VALUES (?)', [dentista_nome.trim()]);
      dentista_id = resDent.lastID;
    }

    // Cálculos financeiros para gravação direta
    const vb = parseFloat(valor_bruto) || 0;
    const co = parseFloat(custo_operacional) || 0;
    const lucro_liquido = vb - co;

    // 3. Inserir o Serviço final com os relacionamentos perfeitos
    const result = await query(
      `INSERT INTO trabalhos (
        paciente_id, dentista_id, tipo_protese_id, descricao, procedimento, 
        data_entrada, prazo_entrega, prioridade, valor_bruto, custo_operacional, 
        lucro_liquido, forma_pagamento, resumo_trabalho, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paciente_id,
        dentista_id,
        tipo_protese_id || null,
        descricao || 'Sem descrição complementar',
        procedimento,
        data_entrada || new Date().toISOString().split('T')[0],
        prazo_entrega || null,
        prioridade || 'normal',
        vb,
        co,
        lucro_liquido,
        forma_pagamento || null,
        resumo_trabalho || null, 
        observacoes || null      
      ]
    );

    res.status(201).json({
      message: 'Trabalho criado com sucesso',
      id: result.lastID
    });
  } catch (error) {
    console.error('Erro ao criar trabalho:', error);
    res.status(500).json({ error: 'Erro interno ao criar trabalho' });
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

    const vb = valor_bruto || trabalho.valor_bruto;
    const co = custo_operacional || trabalho.custo_operacional;
    const lucro_liquido = vb - co;

    await query(
      `UPDATE trabalhos SET descricao = ?, procedimento = ?, data_saida = ?, status = ?, valor_bruto = ?, custo_operacional = ?, lucro_liquido = ?, prazo_entrega = ?, prioridade = ?, forma_pagamento = ?, resumo_trabalho = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [descricao || trabalho.descricao, procedimento || trabalho.procedimento, data_saida || trabalho.data_saida, status || trabalho.status, vb, co, lucro_liquido, prazo_entrega || trabalho.prazo_entrega, prioridade || trabalho.prioridade, forma_pagamento || trabalho.forma_pagamento, resumo_trabalho || trabalho.resumo_trabalho, observacoes || trabalho.observacoes, id]
    );

    res.json({ message: 'Trabalho updated com sucesso' });
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
