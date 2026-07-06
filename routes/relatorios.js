import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Garantia estrutural de tabelas
const garantirColunas = async () => {
  try { await query("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
  try { await query("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
};

// 1. Dashboard corrigido selecionando todas as propriedades para evitar erros de undefined (.toString)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    
    const dataInicio = new Date(hoje);
    dataInicio.setDate(hoje.getDate() - 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const emAndamento = await get('SELECT COUNT(*) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")');
    const receitaPeriodo = await get('SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) >= datetime("now", "-1 day")');
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

    // Seleciona t.* para garantir que todas as colunas cheguem ao front-end e impeçam quebras de toString()
    const ultimasEntregas = await all(`
      SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome
      FROM trabalhos t 
      LEFT JOIN pacientes p ON t.paciente_id = p.id 
      LEFT JOIN dentistas d ON t.dentista_id = d.id 
      LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id
      WHERE t.status = "Finalizado" AND IFNULL(t.data_saida, t.data_entrada) >= datetime("now", "-1 day") 
      ORDER BY IFNULL(t.data_saida, t.data_entrada) DESC LIMIT 3
    `);

    const proximosServicos = await all(`
      SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome
      FROM trabalhos t 
      LEFT JOIN pacientes p ON t.paciente_id = p.id 
      LEFT JOIN dentistas d ON t.dentista_id = d.id 
      LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega BETWEEN ? AND ? 
      ORDER BY t.prazo_entrega ASC, t.prioridade DESC LIMIT 3
    `, [hojeStr, proximaDataStr]);

    const detalhesAtrasados = await all(`
      SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome,
             CAST((julianday(?) - julianday(t.prazo_entrega)) AS INTEGER) as dias_atraso
      FROM trabalhos t 
      LEFT JOIN pacientes p ON t.paciente_id = p.id 
      LEFT JOIN dentistas d ON t.dentista_id = d.id 
      LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega < ? AND t.prazo_entrega IS NOT NULL 
      ORDER BY t.prazo_entrega ASC LIMIT 3
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
      // Sanitização de dados convertendo IDs e valores de forma segura para string/number protegendo o front
      ultimasEntregas: (ultimasEntregas || []).map(u => ({
        ...u,
        id: u.id ? u.id.toString() : "",
        procedimento: u.procedimento || "",
        status: u.status || "Finalizado",
        prioridade: u.prioridade || "normal"
      })),
      proximosServicos: (proximosServicos || []).map(p => ({
        ...p,
        id: p.id ? p.id.toString() : "",
        procedimento: p.procedimento || "",
        status: p.status || "Pendente",
        prioridade: p.prioridade || "normal"
      })),
      servicosAtrasados: (detalhesAtrasados || []).map(d => ({
        ...d,
        id: d.id ? d.id.toString() : "",
        procedimento: d.procedimento || "",
        status: d.status || "Pendente",
        prioridade: d.prioridade || "normal"
      }))
    });
  } catch (error) {
    console.error("Erro na rota do dashboard:", error);
    res.status(500).json({ error: 'Erro ao obter dashboard' });
  }
});

// Dashboard com filtros avançados
router.get('/servicos-filtrados', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
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

// Relatório de fluxo de caixa
router.get('/fluxo-caixa', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    let queryText = 'SELECT * FROM trabalhos WHERE status = "Finalizado"';
    const params = [];
    if (data_inicio && data_fim) { queryText += ' AND data_entrada BETWEEN ? AND ?'; params.push(data_inicio, data_fim); }
    queryText += ' ORDER BY data_entrada DESC';

    const trabalhos = await all(queryText, params);
    const totais = { valorBruto: 0, custoOperacional: 0, lucroLiquido: 0, quantidade: trabalhos.length };
    trabalhos.forEach(t => { totais.valorBruto += t.valor_bruto || 0; totais.custoOperacional += t.custo_operacional || 0; totais.lucroLiquido += t.lucro_liquido || 0; });

    res.json({ trabalhos, totais });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter fluxo de caixa' });
  }
});

// Resumo por período
router.get('/resumo', verifyToken, async (req, res) => {
  try {
    const { periodo = 'mes', data_inicio, data_fim } = req.query;
    let dIni, dFim;
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];

    if (data_inicio && data_fim) { dIni = data_inicio; dFim = data_fim; } 
    else {
      let dataInicio;
      switch (periodo) {
        case 'hoje': dataInicio = hoje; break;
        case 'semana': dataInicio = new Date(hoje); dataInicio.setDate(hoje.getDate() - 7); break;
        case 'ano': dataInicio = new Date(hoje); dataInicio.setFullYear(hoje.getFullYear() - 1); break;
        default: dataInicio = new Date(hoje); dataInicio.setMonth(hoje.getMonth() - 1);
      }
      dIni = dataInicio.toISOString().split('T')[0]; dFim = hojeStr;
    }

    const porProcedimento = await all(`SELECT procedimento, COUNT(*) as quantidade, SUM(valor_bruto) as receita, SUM(lucro_liquido) as lucro FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ? GROUP BY procedimento ORDER BY quantidade DESC`, [dIni, dFim]);
    const receitaPorDia = await all(`SELECT IFNULL(data_saida, data_entrada) as data, SUM(valor_bruto) as receita, SUM(lucro_liquido) as lucro, COUNT(*) as quantidade FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ? GROUP BY data ORDER BY data ASC`, [dIni, dFim]);
    const totais = await get(`SELECT COUNT(*) as quantidade, SUM(valor_bruto) as receita, SUM(custo_operacional) as custo, SUM(lucro_liquido) as lucro FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?`, [dIni, dFim]);

    res.json({
      periodo, data_inicio: dIni, data_fim: dFim, porProcedimento, receitaPorDia,
      totais: { quantidade: totais?.quantidade || 0, receita: totais?.receita || 0, custo: totais?.custo || 0, lucro: totais?.lucro || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter resumo' });
  }
});

// Relatório por forma de pagamento
router.get('/por-pagamento', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    let queryText = `SELECT forma_pagamento, COUNT(*) as quantidade, SUM(valor_bruto) as valor FROM trabalhos WHERE status = "Finalizado"`;
    const params = [];
    if (data_inicio && data_fim) { queryText += ' AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?'; params.push(data_inicio, data_fim); }
    queryText += ' GROUP BY forma_pagamento ORDER BY valor DESC';

    const resultado = await all(queryText, params);
    const totais = await get(`SELECT COUNT(*) as quantidade, SUM(valor_bruto) as valor FROM trabalhos WHERE status = "Finalizado" ${data_inicio && data_fim ? 'AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?' : ''}`, data_inicio && data_fim ? [data_inicio, data_fim] : []);

    const resumo = {};
    resultado.forEach(r => { const forma = r.forma_pagamento || 'Não Especificado'; resumo[forma] = { quantidade: r.quantidade, valor: r.valor || 0 }; });

    res.json({ data_inicio, data_fim, resumo, total: { quantity: totais?.quantidade || 0, valor: totais?.valor || 0 } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter relatório por pagamento' });
  }
});

// Relatório Completo unificado (Alimenta a tela de Reports)
router.get('/completo', verifyToken, async (req, res) => {
  try {
    await garantirColunas();
    const { periodo = 'mes' } = req.query;
    
    const hoje = new Date();
    let dataInicio = new Date();
    
    if (periodo === 'hoje') dataInicio.setDate(hoje.getDate());
    else if (periodo === 'semana') dataInicio.setDate(hoje.getDate() - 7);
    else if (periodo === 'quinzena') dataInicio.setDate(hoje.getDate() - 15);
    else dataInicio.setMonth(hoje.getMonth() - 1);
    
    const dIni = dataInicio.toISOString().split('T')[0] + ' 00:00:00';
    const dFim = hoje.toISOString().split('T')[0] + ' 23:59:59';

    const completedServices = await all(`
      SELECT t.id, p.nome as patient, d.nome as dentist, t.procedimento as procedure, 
             t.valor_bruto as grossValue, t.custo_operacional as operationCost, 
             t.lucro_liquido as netProfit, IFNULL(t.data_saida, t.data_entrada) as completedAt,
             IFNULL(t.forma_pagamento, 'Não Informado') as forma_pagamento
      FROM trabalhos t
      LEFT JOIN pacientes p ON t.paciente_id = p.id
      LEFT JOIN dentistas d ON t.dentista_id = d.id
      WHERE t.status = "Finalizado"
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      ORDER BY completedAt DESC
    `, [dIni, dFim]);

    const monthlyData = await all(`
      SELECT strftime('%Y-%m', IFNULL(t.data_saida, t.data_entrada)) as month, 
             SUM(t.valor_bruto) as revenue, 
             SUM(t.custo_operacional) as cost, 
             SUM(t.lucro_liquido) as profit
      FROM trabalhos t
      WHERE t.status = "Finalizado"
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12
    `);

    // Corrigido para buscar da coluna 'descricao' nativa do banco de dados na tabela custos
    let costsDistribution = await all(`
      SELECT c.descricao as name, SUM(c.valor) as value
      FROM custos c
      JOIN trabalhos t ON c.trabalho_id = t.id
      WHERE t.status = "Finalizado" 
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      AND c.descricao IS NOT NULL AND c.descricao != ''
      GROUP BY c.descricao
      ORDER BY value DESC
    `, [dIni, dFim]);

    const paymentMethods = await all(`
      SELECT IFNULL(forma_pagamento, 'Não Informado') as name, 
             SUM(valor_bruto) as value,
             COUNT(*) as count
      FROM trabalhos
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
      GROUP BY name
      ORDER BY value DESC
    `, [dIni, dFim]);

    const totals = await get(`
      SELECT SUM(valor_bruto) as revenue, SUM(custo_operacional) as cost, SUM(lucro_liquido) as profit
      FROM trabalhos 
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
    `, [dIni, dFim]);

    if (costsDistribution.length === 0 && totals?.cost > 0) {
      costsDistribution.push({ name: 'Custos Gerais', value: totals.cost });
    }

    res.json({
      completedServices,
      monthlyData: monthlyData.map(d => ({ month: d.month, revenue: d.revenue || 0, cost: d.cost || 0, profit: d.profit || 0 })),
      costsDistribution: costsDistribution.map(c => ({ name: c.name, value: c.value || 0 })),
      paymentMethods: paymentMethods.map(p => ({ name: p.name, value: p.value || 0, count: p.count || 0 })),
      totals: { revenue: totals?.revenue || 0, cost: totals?.cost || 0, profit: totals?.profit || 0 }
    });

  } catch (error) {
    console.error('Erro na API de relatórios:', error.message);
    res.status(500).json({ error: 'Erro interno ao compilar relatórios' });
  }
});

export default router;
