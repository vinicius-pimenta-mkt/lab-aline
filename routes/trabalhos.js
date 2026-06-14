import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Dashboard com KPIs melhorados (últimas 24h)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    
    const dataInicio = new Date(hoje);
    dataInicio.setDate(hoje.getDate() - 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const emAndamento = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');
    const receitaPeriodo = await get('SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status = "Finalizado" AND data_saida >= datetime("now", "-1 day")');
    const finalizados = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status = "Finalizado"');
    const lucroLiquido = await get('SELECT SUM(lucro_liquido) as total FROM trabalhos WHERE status = "Finalizado"');
    const receitaPendente = await get('SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');
    
    const servicosAtrasados = await get(`
      SELECT COUNT(*) as total FROM trabalhos 
      WHERE status IN ("Pendente", "Em Andamento") AND prazo_entrega < ? AND prazo_entrega IS NOT NULL
    `, [hojeStr]);

    const proximaData = new Date(hoje);
    proximaData.setDate(hoje.getDate() + 1);
    const proximaDataStr = proximaData.toISOString().split('T')[0];

    const proximasEntregas = await get(`
      SELECT COUNT(*) as total FROM trabalhos 
      WHERE status IN ("Pendente", "Em Andamento") AND prazo_entrega BETWEEN ? AND ?
    `, [hojeStr, proximaDataStr]);

    const ultimasEntregas = await all(`
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.data_saida, t.valor_bruto, t.lucro_liquido
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status = "Finalizado" AND t.data_saida >= datetime("now", "-1 day") ORDER BY t.data_saida DESC LIMIT 3
    `);

    const proximosServicos = await all(`
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade, t.status
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega BETWEEN ? AND ? ORDER BY t.prazo_entrega ASC, t.prioridade DESC LIMIT 3
    `, [hojeStr, proximaDataStr]);

    const detalhesAtrasados = await all(`
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade,
             CAST((julianday(?) - julianday(t.prazo_entrega)) AS INTEGER) as dias_atraso
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega < ? AND t.prazo_entrega IS NOT NULL ORDER BY t.prazo_entrega ASC LIMIT 3
    `, [hojeStr, hojeStr]);

    res.json({
      periodo: '24h', data_inicio: dataInicioStr, data_fim: hojeStr,
      kpis: {
        emAndamento: emAndamento?.total || 0,
        receitaPeriodo: receitaPeriodo?.total || 0,
        finalizados: finalizados?.total || 0,
        lucroLiquido: lucroLiquido?.total || 0,
        receitaPendente: receitaPendente?.total || 0,
        servicosAtrasados: servicosAtrasados?.total || 0,
        proximasEntregas: proximasEntregas?.total || 0
      },
      ultimasEntregas, proximosServicos, servicosAtrasados: detalhesAtrasados
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter dashboard' });
  }
});

// Dashboard com filtros avançados (para ecrã de Serviços)
router.get('/servicos-filtrados', verifyToken, async (req, res) => {
  try {
    const { status, prioridade, atrasados, proximas_entregas, data_inicio, data_fim } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    let queryText = `SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id`;
    const params = [];
    const conditions = [];

    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (prioridade) { conditions.push('t.prioridade = ?'); params.push(prioridade); }
    if (atrasados === 'true') { conditions.push('t.status IN ("Pendente", "Em Andamento")', 't.prazo_entrega < ?', 't.prazo_entrega IS NOT NULL'); params.push(hoje); }
    if (proximas_entregas === 'true') {
      const proximaData = new Date(); proximaData.setDate(proximaData.getDate() + 7);
      conditions.push('t.status IN ("Pendente", "Em Andamento")', 't.prazo_entrega BETWEEN ? AND ?'); params.push(hoje, proximaData.toISOString().split('T')[0]);
    }
    if (data_inicio && data_fim) { conditions.push('t.data_entrada BETWEEN ? AND ?'); params.push(data_inicio, data_fim); }
    
    if (conditions.length > 0) queryText += ' WHERE ' + conditions.join(' AND ');
    queryText += ' ORDER BY t.prioridade DESC, t.prazo_entrega ASC';

    res.json(await all(queryText, params));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter serviços filtrados' });
  }
});

// Obter trabalho por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const trabalho = await get(
      `SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome 
       FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id 
       WHERE t.id = ?`, [id]
    );
    if (!trabalho) return res.status(404).json({ error: 'Trabalho não encontrado' });
    const etapas = await all('SELECT * FROM etapas WHERE trabalho_id = ? ORDER BY ordem ASC', [id]);
    const custos = await all('SELECT * FROM custos WHERE trabalho_id = ? ORDER BY data DESC', [id]);
    res.json({ ...trabalho, etapas, custos });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter trabalho' });
  }
});

// Criar novo trabalho (AGORA COM ESTADO E DATA DE FINALIZAÇÃO)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      paciente_nome, dentista_nome, tipo_protese_id, descricao, procedimento, 
      data_entrada, prazo_entrega, prioridade, valor_bruto, custo_operacional,
      forma_pagamento, resumo_trabalho, observacoes, etapas, 
      status, data_saida // NOVOS CAMPOS
    } = req.body;

    if (!paciente_nome || !dentista_nome || !procedimento || !valor_bruto) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    let paciente = await get('SELECT id FROM pacientes WHERE nome = ?', [paciente_nome.trim()]);
    let paciente_id = paciente ? paciente.id : (await query('INSERT INTO pacientes (nome) VALUES (?)', [paciente_nome.trim()])).lastID;

    let dentista = await get('SELECT id FROM dentistas WHERE nome = ?', [dentista_nome.trim()]);
    let dentista_id = dentista ? dentista.id : (await query('INSERT INTO dentistas (nome) VALUES (?)', [dentista_nome.trim()])).lastID;

    const vb = parseFloat(valor_bruto) || 0;
    const co = parseFloat(custo_operacional) || 0;
    const lucro_liquido = vb - co;

    const result = await query(
      `INSERT INTO trabalhos (
        paciente_id, dentista_id, tipo_protese_id, descricao, procedimento, 
        data_entrada, data_saida, prazo_entrega, prioridade, valor_bruto, custo_operacional, 
        lucro_liquido, forma_pagamento, resumo_trabalho, observacoes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paciente_id, dentista_id, tipo_protese_id || null, descricao || '', procedimento,
        data_entrada || new Date().toISOString().split('T')[0], 
        data_saida || null, // APLICA A DATA CASO JÁ VENHA FINALIZADO
        prazo_entrega || null, prioridade || 'normal', vb, co, lucro_liquido, 
        forma_pagamento || null, resumo_trabalho || null, observacoes || null, 
        status || 'Pendente' // APLICA O STATUS CORRETO
      ]
    );

    const trabalhoId = result.lastID;

    if (etapas && Array.isArray(etapas)) {
      for (let i = 0; i < etapas.length; i++) {
        if (etapas[i].nome?.trim()) {
          await query(
            `INSERT INTO etapas (trabalho_id, nome, descricao, status, ordem) VALUES (?, ?, ?, ?, ?)`,
            [trabalhoId, etapas[i].nome.trim(), etapas[i].descricao || '', etapas[i].status || 'pending', i]
          );
        }
      }
    }

    res.status(201).json({ message: 'Trabalho criado com sucesso', id: trabalhoId });
  } catch (error) {
    console.error('Erro ao criar trabalho:', error);
    res.status(500).json({ error: 'Erro interno ao criar trabalho' });
  }
});

// Atualizar trabalho
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao, procedimento, data_saida, status, valor_bruto, custo_operacional, prazo_entrega, prioridade, forma_pagamento, resumo_trabalho, observacoes, etapas } = req.body;

    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [id]);
    if (!trabalho) return res.status(404).json({ error: 'Trabalho não encontrado' });

    const vb = valor_bruto !== undefined ? parseFloat(valor_bruto) : trabalho.valor_bruto;
    const co = custo_operacional !== undefined ? parseFloat(custo_operacional) : trabalho.custo_operacional;
    const lucro_liquido = vb - co;

    await query(
      `UPDATE trabalhos SET 
        descricao = ?, procedimento = ?, data_saida = ?, status = ?, valor_bruto = ?, custo_operacional = ?, 
        lucro_liquido = ?, prazo_entrega = ?, prioridade = ?, forma_pagamento = ?, resumo_trabalho = ?, 
        observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        descricao || trabalho.descricao, procedimento || trabalho.procedimento, data_saida !== undefined ? data_saida : trabalho.data_saida, 
        status || trabalho.status, vb, co, lucro_liquido, prazo_entrega || trabalho.prazo_entrega, 
        prioridade || trabalho.prioridade, forma_pagamento || trabalho.forma_pagamento, 
        resumo_trabalho || trabalho.resumo_trabalho, observacoes || trabalho.observacoes, id
      ]
    );

    if (etapas && Array.isArray(etapas)) {
      await query('DELETE FROM etapas WHERE trabalho_id = ?', [id]);
      for (let i = 0; i < etapas.length; i++) {
        if (etapas[i].nome?.trim()) {
          await query(
            `INSERT INTO etapas (trabalho_id, nome, descricao, status, ordem) VALUES (?, ?, ?, ?, ?)`,
            [id, etapas[i].nome.trim(), etapas[i].descricao || '', etapas[i].status || 'pending', i]
          );
        }
      }
    }

    res.json({ message: 'Trabalho atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar trabalho' });
  }
});

// Deletar trabalho
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [id]);
    if (!trabalho) return res.status(404).json({ error: 'Trabalho não encontrado' });

    await query('DELETE FROM etapas WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM custos WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM anexos WHERE trabalho_id = ?', [id]);
    await query('DELETE FROM trabalhos WHERE id = ?', [id]);

    res.json({ message: 'Trabalho deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar trabalho' });
  }
});

export default router;
