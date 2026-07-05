import express from 'express';
import { all, get, query } from '../database/database.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Listar todos os trabalhos com filtros
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, data_inicio, data_fim, dentista_id, prioridade } = req.query;
    let queryText = `SELECT t.*, p.nome as paciente_nome, p.telefone as paciente_telefone, d.nome as dentista_nome, tp.nome as tipo_protese_nome 
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
    queryText += ' ORDER BY t.prioridade DESC, t.prazo_entrega ASC';

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

// Criar novo trabalho salvando os custos dinâmicos na tabela vinculada e lidando com múltiplos itens
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      paciente_nome, 
      paciente_telefone,
      dentista_nome, 
      tipo_protese_id, 
      descricao, 
      procedimento, 
      data_entrada, 
      data_saida,
      prazo_entrega, 
      prioridade, 
      valor_bruto, 
      custo_operacional,
      forma_pagamento, 
      resumo_trabalho, 
      observacoes,
      etapas,
      status,
      costs,
      proceduresList // CAMPO NOVO: Para receber os múltiplos procedimentos da tela
    } = req.body;

    if (!paciente_nome || !dentista_nome) {
      return res.status(400).json({ error: 'Paciente e Dentista são campos obrigatórios' });
    }

    // BUSCA BLINDADA CONTRA DUPLICATAS (Ignora espaços ocultos e sensibilidade de letras)
    let paciente = await get('SELECT id FROM pacientes WHERE TRIM(nome) LIKE ?', [paciente_nome.trim()]);
    let paciente_id = paciente ? paciente.id : (await query('INSERT INTO pacientes (nome) VALUES (?)', [paciente_nome.trim()])).lastID;

    let dentista = await get('SELECT id FROM dentistas WHERE TRIM(nome) LIKE ?', [dentista_nome.trim()]);
    let dentista_id = dentista ? dentista.id : (await query('INSERT INTO dentistas (nome) VALUES (?)', [dentista_nome.trim()])).lastID;

    const entradaData = data_entrada || new Date().toISOString().split('T')[0];

    // Mapear procedimentos: Se vier da nova lista (proceduresList), usa ela. Se vier da tela antiga, usa o procedimento único.
    let itensParaInserir = [];
    if (proceduresList && Array.isArray(proceduresList) && proceduresList.length > 0) {
      itensParaInserir = proceduresList.filter(item => item.procedure?.trim());
    } else if (procedimento?.trim()) {
      itensParaInserir = [{ procedure: procedimento, grossValue: valor_bruto }];
    }

    if (itensParaInserir.length === 0) {
      return res.status(400).json({ error: 'Nenhum procedimento/serviço foi informado' });
    }

    const idsCriados = [];

    // Faz um loop inserindo cada procedimento como um "trabalho" vinculado ao mesmo paciente/dentista
    for (let idx = 0; idx < itensParaInserir.length; idx++) {
      const item = itensParaInserir[idx];
      const vb = parseFloat(item.grossValue) || 0;
      
      // IMPORTANTE: Para não duplicar os custos passados no formulário, atrelamos eles APENAS ao 1º item da lista
      const co = (idx === 0) ? (parseFloat(custo_operacional) || 0) : 0;
      const lucro_liquido = vb - co;

      const result = await query(
        `INSERT INTO trabalhos (
          paciente_id, dentista_id, tipo_protese_id, descricao, procedimento, 
          data_entrada, data_saida, prazo_entrega, prioridade, valor_bruto, custo_operacional, 
          lucro_liquido, forma_pagamento, resumo_trabalho, observacoes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paciente_id, dentista_id, tipo_protese_id || null, descricao || '', item.procedure.trim(),
          entradaData, data_saida || null, prazo_entrega || null,
          prioridade || 'normal', vb, co, lucro_liquido, forma_pagamento || null,
          resumo_trabalho || null, observacoes || null, status || 'Pendente'
        ]
      );

      const trabalhoId = result.lastID;
      idsCriados.push(trabalhoId);

      // Gravar custos individualizados na tabela custos (SOMENTE no primeiro item)
      if (idx === 0 && costs && Array.isArray(costs)) {
        for (let cost of costs) {
          const nomeCusto = cost.name?.trim() || cost.descricao?.trim();
          if (nomeCusto) {
            await query(
              `INSERT INTO custos (trabalho_id, descricao, tipo, valor, data) VALUES (?, ?, ?, ?, ?)`,
              [trabalhoId, nomeCusto, 'Operacional', parseFloat(cost.value) || 0, entradaData]
            );
          }
        }
      }

      // Gravar as etapas de produção para CADA item (assim cada prótese terá seu controle independente de "Pendente, Em Andamento", etc)
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
    }

    res.status(201).json({ message: 'Trabalhos criados com sucesso', id: idsCriados[0], ids: idsCriados });
  } catch (error) {
    console.error('Erro ao criar trabalho:', error);
    res.status(500).json({ error: 'Erro interno ao criar trabalho' });
  }
});

// Atualizar trabalho sincronizando custos dinâmicos
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      descricao, procedimento, status, data_saida, valor_bruto, custo_operacional, 
      prazo_entrega, prioridade, forma_pagamento, resumo_trabalho, 
      observacoes, etapas, costs
    } = req.body;

    const trabalho = await get('SELECT * FROM trabalhos WHERE id = ?', [id]);
    if (!trabalho) {
      return res.status(404).json({ error: 'Trabalho não encontrado' });
    }

    const vb = valor_bruto !== undefined ? parseFloat(valor_bruto) : trabalho.valor_bruto;
    const co = custo_operacional !== undefined ? parseFloat(custo_operacional) : trabalho.custo_operacional;
    const lucro_liquido = vb - co;

    await query(
      `UPDATE trabalhos SET 
        descricao = ?, procedimento = ?, status = ?, data_saida = ?, valor_bruto = ?, custo_operacional = ?, 
        lucro_liquido = ?, prazo_entrega = ?, prioridade = ?, forma_pagamento = ?, 
        resumo_trabalho = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        descricao || trabalho.descricao, procedimento || trabalho.procedimento, status || trabalho.status,
        data_saida !== undefined ? data_saida : trabalho.data_saida,
        vb, co, lucro_liquido, prazo_entrega || trabalho.prazo_entrega, prioridade || trabalho.prioridade,
        forma_pagamento || trabalho.forma_pagamento, resumo_trabalho || trabalho.resumo_trabalho,
        observacoes || trabalho.observacoes, id
      ]
    );

    // Sincronizar custos individualizados
    if (costs && Array.isArray(costs)) {
      await query('DELETE FROM custos WHERE trabalho_id = ?', [id]);
      for (let cost of costs) {
        const nomeCusto = cost.name?.trim() || cost.descricao?.trim();
        if (nomeCusto) {
          await query(
            `INSERT INTO custos (trabalho_id, descricao, tipo, valor, data) VALUES (?, ?, ?, ?, ?)`,
            [id, nomeCusto, 'Operacional', parseFloat(cost.value) || 0, trabalho.data_entrada]
          );
        }
      }
    }

    // Sincronizar etapas
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

    res.json({ message: 'Trabalho updated' });
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
