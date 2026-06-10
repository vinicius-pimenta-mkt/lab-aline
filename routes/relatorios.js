import express from 'express';
import { all, get } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Dashboard com KPIs melhorados (últimas 24h)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    
    // Dashboard mostra apenas últimas 24h
    const dataInicio = new Date(hoje);
    dataInicio.setDate(hoje.getDate() - 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    // Serviços em andamento
    const emAndamento = await get(
      'SELECT COUNT(*) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")'
    );

    // Receita das últimas 24h
    const receitaPeriodo = await get(
      'SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status = "Finalizado" AND data_saida >= datetime("now", "-1 day")',
      []
    );

    // Finalizados
    const finalizados = await get(
      'SELECT COUNT(*) as total FROM trabalhos WHERE status = "Finalizado"'
    );

    // Lucro líquido
    const lucroLiquido = await get(
      'SELECT SUM(lucro_liquido) as total FROM trabalhos WHERE status = "Finalizado"'
    );

    // NOVOS KPIs
    // Receitas pendentes (de serviços em andamento)
    const receitaPendente = await get(
      'SELECT SUM(valor_bruto) as total FROM trabalhos WHERE status IN ("Pendente", "Em Andamento")'
    );

    // Serviços atrasados (para exibição no dashboard)
    const servicosAtrasados = await get(
      `SELECT COUNT(*) as total FROM trabalhos 
       WHERE status IN ("Pendente", "Em Andamento") 
       AND prazo_entrega < ? 
       AND prazo_entrega IS NOT NULL`,
      [hojeStr]
    );

    // Próximas entregas (próximas 24h)
    const proximaData = new Date(hoje);
    proximaData.setDate(hoje.getDate() + 1);
    const proximaDataStr = proximaData.toISOString().split('T')[0];

    const proximasEntregas = await get(
      `SELECT COUNT(*) as total FROM trabalhos 
       WHERE status IN ("Pendente", "Em Andamento") 
       AND prazo_entrega BETWEEN ? AND ?`,
      [hojeStr, proximaDataStr]
    );

    // Últimas entregas (últimos 3 serviços concluídos nas últimas 24h)
    const ultimasEntregas = await all(
      `SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.data_saida, t.valor_bruto, t.lucro_liquido
       FROM trabalhos t 
       LEFT JOIN pacientes p ON t.paciente_id = p.id 
       LEFT JOIN dentistas d ON t.dentista_id = d.id 
       WHERE t.status = "Finalizado" AND t.data_saida >= datetime("now", "-1 day")
       ORDER BY t.data_saida DESC
       LIMIT 3`
    );

    // Próximas entregas (próximas 24h)
    const proximosServicos = await all(
      `SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade, t.status
       FROM trabalhos t 
       LEFT JOIN pacientes p ON t.paciente_id = p.id 
       LEFT JOIN dentistas d ON t.dentista_id = d.id 
       WHERE t.status IN ("Pendente", "Em Andamento")
       AND t.prazo_entrega BETWEEN ? AND ?
       ORDER BY t.prazo_entrega ASC, t.prioridade DESC
       LIMIT 3`,
      [hojeStr, proximaDataStr]
    );

    // Serviços atrasados (detalhes - apenas para exibição)
    const detalhesAtrasados = await all(
      `SELECT t.id, t.descricao, p.nome as paciente_nome, d.nome as dentista_nome, t.prazo_entrega, t.prioridade,
              CAST((julianday(?) - julianday(t.prazo_entrega)) AS INTEGER) as dias_atraso
       FROM trabalhos t 
       LEFT JOIN pacientes p ON t.paciente_id = p.id 
       LEFT JOIN dentistas d ON t.dentista_id = d.id 
       WHERE t.status IN ("Pendente", "Em Andamento") 
       AND t.prazo_entrega < ? 
       AND t.prazo_entrega IS NOT NULL
       ORDER BY t.prazo_entrega ASC
       LIMIT 3`,
      [hojeStr, hojeStr]
    );

    res.json({
      periodo: '24h',
      data_inicio: dataInicioStr,
      data_fim: hojeStr,
      kpis: {
        emAndamento: emAndamento?.total || 0,
        receitaPeriodo: receitaPeriodo?.total || 0,
        finalizados: finalizados?.total || 0,
        lucroLiquido: lucroLiquido?.total || 0,
        receitaPendente: receitaPendente?.total || 0,
        servicosAtrasados: servicosAtrasados?.total || 0,
        proximasEntregas: proximasEntregas?.total || 0
      },
      ultimasEntregas,
      proximosServicos,
      servicosAtrasados: detalhesAtrasados
    });
  } catch (error) {
    console.error('Erro ao obter dashboard:', error);
    res.status(500).json({ error: 'Erro ao obter dashboard' });
  }
});

// Dashboard com filtros avançados (para tela de Serviços)
router.get('/servicos-filtrados', verifyToken, async (req, res) => {
  try {
    const { status, prioridade, atrasados, proximas_entregas, data_inicio, data_fim } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    
    let queryText = `SELECT t.*, p.nome as paciente_nome, d.nome as dentista_nome, tp.nome as tipo_protese_nome
                     FROM trabalhos t 
                     LEFT JOIN pacientes p ON t.paciente_id = p.id 
                     LEFT JOIN dentistas d ON t.dentista_id = d.id 
                     LEFT JOIN tipos_protese tp ON t.tipo_protese_id = tp.id`;
    const params = [];
    const conditions = [];

    // Filtro de status
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    // Filtro de prioridade
    if (prioridade) {
      conditions.push('t.prioridade = ?');
      params.push(prioridade);
    }

    // Filtro de atrasados
    if (atrasados === 'true') {
      conditions.push('t.status IN ("Pendente", "Em Andamento")');
      conditions.push('t.prazo_entrega < ?');
      conditions.push('t.prazo_entrega IS NOT NULL');
      params.push(hoje);
    }

    // Filtro de próximas entregas (próximos 7 dias)
    if (proximas_entregas === 'true') {
      const proximaData = new Date();
      proximaData.setDate(proximaData.getDate() + 7);
      const proximaDataStr = proximaData.toISOString().split('T')[0];
      
      conditions.push('t.status IN ("Pendente", "Em Andamento")');
      conditions.push('t.prazo_entrega BETWEEN ? AND ?');
      params.push(hoje, proximaDataStr);
    }

    // Filtro por período customizado
    if (data_inicio && data_fim) {
      conditions.push('t.data_entrada BETWEEN ? AND ?');
      params.push(data_inicio, data_fim);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ' ORDER BY t.prioridade DESC, t.prazo_entrega ASC';

    const resultado = await all(queryText, params);
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao obter serviços filtrados:', error);
    res.status(500).json({ error: 'Erro ao obter serviços filtrados' });
  }
});

// Relatório de fluxo de caixa
router.get('/fluxo-caixa', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    
    let queryText = 'SELECT * FROM trabalhos WHERE status = "Finalizado"';
    const params = [];

    if (data_inicio && data_fim) {
      queryText += ' AND data_entrada BETWEEN ? AND ?';
      params.push(data_inicio, data_fim);
    }

    queryText += ' ORDER BY data_entrada DESC';

    const trabalhos = await all(queryText, params);

    // Calcular totais
    const totais = {
      valorBruto: 0,
      custoOperacional: 0,
      lucroLiquido: 0,
      quantidade: trabalhos.length
    };

    trabalhos.forEach(t => {
      totais.valorBruto += t.valor_bruto || 0;
      totais.custoOperacional += t.custo_operacional || 0;
      totais.lucroLiquido += t.lucro_liquido || 0;
    });

    res.json({
      trabalhos,
      totais
    });
  } catch (error) {
    console.error('Erro ao obter fluxo de caixa:', error);
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

    if (data_inicio && data_fim) {
      dIni = data_inicio;
      dFim = data_fim;
    } else {
      let dataInicio;
      switch (periodo) {
        case 'hoje':
          dataInicio = hoje;
          break;
        case 'semana':
          dataInicio = new Date(hoje);
          dataInicio.setDate(hoje.getDate() - 7);
          break;
        case 'ano':
          dataInicio = new Date(hoje);
          dataInicio.setFullYear(hoje.getFullYear() - 1);
          break;
        default:
          dataInicio = new Date(hoje);
          dataInicio.setMonth(hoje.getMonth() - 1);
      }
      dIni = dataInicio.toISOString().split('T')[0];
      dFim = hojeStr;
    }

    // Serviços por procedimento
    const porProcedimento = await all(
      `SELECT procedimento, COUNT(*) as quantidade, SUM(valor_bruto) as receita, SUM(lucro_liquido) as lucro
       FROM trabalhos 
       WHERE status = "Finalizado" AND data_entrada BETWEEN ? AND ?
       GROUP BY procedimento
       ORDER BY quantidade DESC`,
      [dIni, dFim]
    );

    // Receita por dia
    const receitaPorDia = await all(
      `SELECT data_entrada as data, SUM(valor_bruto) as receita, SUM(lucro_liquido) as lucro, COUNT(*) as quantidade
       FROM trabalhos 
       WHERE status = "Finalizado" AND data_entrada BETWEEN ? AND ?
       GROUP BY data_entrada
       ORDER BY data_entrada ASC`,
      [dIni, dFim]
    );

    // Totais
    const totais = await get(
      `SELECT COUNT(*) as quantidade, SUM(valor_bruto) as receita, SUM(custo_operacional) as custo, SUM(lucro_liquido) as lucro
       FROM trabalhos 
       WHERE status = "Finalizado" AND data_entrada BETWEEN ? AND ?`,
      [dIni, dFim]
    );

    res.json({
      periodo,
      data_inicio: dIni,
      data_fim: dFim,
      porProcedimento,
      receitaPorDia,
      totais: {
        quantidade: totais?.quantidade || 0,
        receita: totais?.receita || 0,
        custo: totais?.custo || 0,
        lucro: totais?.lucro || 0
      }
    });
  } catch (error) {
    console.error('Erro ao obter resumo:', error);
    res.status(500).json({ error: 'Erro ao obter resumo' });
  }
});

// Relatório por forma de pagamento
router.get('/por-pagamento', verifyToken, async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    
    let queryText = `SELECT forma_pagamento, COUNT(*) as quantidade, SUM(valor_bruto) as valor
                     FROM trabalhos 
                     WHERE status = "Finalizado"`;
    const params = [];

    if (data_inicio && data_fim) {
      queryText += ' AND data_entrada BETWEEN ? AND ?';
      params.push(data_inicio, data_fim);
    }

    queryText += ' GROUP BY forma_pagamento ORDER BY valor DESC';

    const resultado = await all(queryText, params);

    // Calcular totais
    const totais = await get(
      `SELECT COUNT(*) as quantidade, SUM(valor_bruto) as valor
       FROM trabalhos 
       WHERE status = "Finalizado" ${data_inicio && data_fim ? 'AND data_entrada BETWEEN ? AND ?' : ''}`,
      data_inicio && data_fim ? [data_inicio, data_fim] : []
    );

    // Formatar resposta
    const resumo = {};
    resultado.forEach(r => {
      const forma = r.forma_pagamento || 'Não Especificado';
      resumo[forma] = {
        quantidade: r.quantidade,
        valor: r.valor || 0
      };
    });

    res.json({
      data_inicio,
      data_fim,
      resumo,
      total: {
        quantidade: totais?.quantidade || 0,
        valor: totais?.valor || 0
      }
    });
  } catch (error) {
    console.error('Erro ao obter relatório por pagamento:', error);
    res.status(500).json({ error: 'Erro ao obter relatório por pagamento' });
  }
});

export default router;
