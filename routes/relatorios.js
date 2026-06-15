import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// 🛠️ AUTO-CORREÇÃO DO BANCO
const garantirColunas = async () => {
  try { await query("ALTER TABLE trabalhos ADD COLUMN data_saida TEXT"); } catch (e) {}
  try { await query("ALTER TABLE trabalhos ADD COLUMN forma_pagamento TEXT"); } catch (e) {}
  try { await query("ALTER TABLE custos ADD COLUMN nome TEXT"); } catch (e) {}
};

// ==============================================================================
// 1. DASHBOARD COMPLETO (Com Blindagem Anti-Null)
// ==============================================================================
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
    const lucroLiquido = await get('SELECT SUM(valor_bruto - IFNULL(custo_operacional, 0)) as total FROM trabalhos WHERE status = "Finalizado"');
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
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, IFNULL(t.data_saida, t.data_entrada) as data_saida, t.valor_bruto, (t.valor_bruto - IFNULL(t.custo_operacional, 0)) as lucro_liquido
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status = "Finalizado" AND IFNULL(t.data_saida, t.data_entrada) >= datetime("now", "-1 day") ORDER BY data_saida DESC LIMIT 3
    `);

    const proximosServicos = await all(`
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade, t.status
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega BETWEEN ? AND ? ORDER BY t.prazo_entrega ASC, t.prioridade DESC LIMIT 3
    `);

    const detalhesAtrasados = await all(`
      SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade,
             CAST((julianday(?) - julianday(t.prazo_entrega)) AS INTEGER) as dias_atraso
      FROM trabalhos t LEFT JOIN pacientes p ON t.paciente_id = p.id LEFT JOIN dentistas d ON t.dentista_id = d.id 
      WHERE t.status IN ("Pendente", "Em Andamento") AND t.prazo_entrega < ? AND t.prazo_entrega IS NOT NULL ORDER BY t.prazo_entrega ASC LIMIT 3
    `);

    // 🔥 Proteção garantida para o frontend não quebrar o .toFixed() 🔥
    res.json({
      periodo: '24h', data_inicio: dataInicioStr, data_fim: hojeStr,
      kpis: {
        emAndamento: Number(emAndamento?.total) || 0,
        receitaPeriodo: Number(receitaPeriodo?.total) || 0,
        finalizados: Number(finalizados?.total) || 0,
        lucroLiquido: Number(lucroLiquido?.total) || 0,
        receitaPendente: Number(receitaPendente?.total) || 0,
        servicosAtrasados: Number(servicosAtrasados?.total) || 0,
        proximasEntregas: Number(proximasEntregas?.total) || 0
      },
      ultimasEntregas: (ultimasEntregas || []).map(u => ({
        ...u,
        valor_bruto: Number(u.valor_bruto) || 0,
        lucro_liquido: Number(u.lucro_liquido) || 0
      })),
      proximosServicos: proximosServicos || [], 
      servicosAtrasados: detalhesAtrasados || []
    });
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ error: 'Erro ao obter dashboard' });
  }
});

// ==============================================================================
// 2. SERVIÇOS FILTRADOS
// ==============================================================================
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
    if (data_inicio && data_fim) { conditions.push('IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?'); params.push(data_inicio, data_fim); }
    
    if (conditions.length > 0) queryText += ' WHERE ' + conditions.join(' AND ');
    queryText += ' ORDER BY t.prioridade DESC, t.prazo_entrega ASC';

    const result = await all(queryText, params);
    
    res.json(result.map(s => ({
      ...s,
      valor_bruto: Number(s.valor_bruto) || 0,
      custo_operacional: Number(s.custo_operacional) || 0,
      lucro_liquido: Number(s.lucro_liquido) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter serviços filtrados' });
  }
});

// ==============================================================================
// 3. ROTA COMPLETA (Alimenta a aba de Reports.tsx)
// ==============================================================================
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
             (t.valor_bruto - IFNULL(t.custo_operacional, 0)) as netProfit, IFNULL(t.data_saida, t.data_entrada) as completedAt,
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
             SUM(t.valor_bruto - IFNULL(t.custo_operacional, 0)) as profit
      FROM trabalhos t
      WHERE t.status = "Finalizado"
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12
    `);

    const costsDistribution = await all(`
      SELECT IFNULL(c.nome, 'Outros Custos') as name, SUM(c.valor) as value
      FROM custos c
      JOIN trabalhos t ON c.trabalho_id = t.id
      WHERE t.status = "Finalizado" 
      AND IFNULL(t.data_saida, t.data_entrada) BETWEEN ? AND ?
      AND c.nome IS NOT NULL AND c.nome != ''
      GROUP BY name
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
      SELECT SUM(valor_bruto) as revenue, SUM(custo_operacional) as cost, SUM(valor_bruto - IFNULL(custo_operacional, 0)) as profit
      FROM trabalhos 
      WHERE status = "Finalizado"
      AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?
    `, [dIni, dFim]);

    // 🔥 Proteção garantida para o Reports.tsx 🔥
    res.json({
      completedServices: (completedServices || []).map(s => ({
        ...s,
        grossValue: Number(s.grossValue) || 0,
        operationCost: Number(s.operationCost) || 0,
        netProfit: Number(s.netProfit) || 0
      })),
      monthlyData: (monthlyData || []).map(d => ({ 
        month: d.month, 
        revenue: Number(d.revenue) || 0, 
        cost: Number(d.cost) || 0, 
        profit: Number(d.profit) || 0 
      })),
      costsDistribution: (costsDistribution || []).map(c => ({ 
        name: c.name, 
        value: Number(c.value) || 0 
      })),
      paymentMethods: (paymentMethods || []).map(p => ({ 
        name: p.name, 
        value: Number(p.value) || 0, 
        count: Number(p.count) || 0 
      })),
      totals: { 
        revenue: Number(totals?.revenue) || 0, 
        cost: Number(totals?.cost) || 0, 
        profit: Number(totals?.profit) || 0 
      }
    });

  } catch (error) {
    console.error('Erro ao compilar relatórios:', error);
    res.status(500).json({ error: 'Erro interno ao compilar relatórios' });
  }
});

// ==============================================================================
// 4. ROTAS MENORES RESTANTES (Fluxo, Resumo, Pagamento)
// ==============================================================================
router.get('/fluxo-caixa', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    let queryText = 'SELECT * FROM trabalhos WHERE status = "Finalizado"';
    const params = [];
    if (data_inicio && data_fim) { queryText += ' AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?'; params.push(data_inicio, data_fim); }
    queryText += ' ORDER BY IFNULL(data_saida, data_entrada) DESC';
    
    const trabalhos = await all(queryText, params);
    
    res.json({ 
      trabalhos: trabalhos.map(t => ({
        ...t,
        valor_bruto: Number(t.valor_bruto) || 0,
        custo_operacional: Number(t.custo_operacional) || 0,
        lucro_liquido: Number(t.lucro_liquido) || 0
      })) 
    });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/resumo', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const totais = await get('SELECT SUM(valor_bruto) as receita, SUM(custo_operacional) as custo, SUM(valor_bruto - IFNULL(custo_operacional, 0)) as lucro FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ?', [data_inicio, data_fim]);
    res.json({ 
      totais: {
        receita: Number(totais?.receita) || 0,
        custo: Number(totais?.custo) || 0,
        lucro: Number(totais?.lucro) || 0
      }
    });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/por-pagamento', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const resultado = await all('SELECT IFNULL(forma_pagamento, "Não Informado") as forma_pagamento, SUM(valor_bruto) as valor FROM trabalhos WHERE status = "Finalizado" AND IFNULL(data_saida, data_entrada) BETWEEN ? AND ? GROUP BY forma_pagamento', [data_inicio, data_fim]);
    res.json(resultado.map(r => ({
      ...r,
      valor: Number(r.valor) || 0
    })));
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

export default router;
