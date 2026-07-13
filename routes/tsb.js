import express from 'express';
import { all, query, get } from '../database/database.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// ==========================================
// GARANTIA DE TABELAS E COLUNAS
// ==========================================
const garantirTabelasTsb = async () => {
  try { await query("ALTER TABLE tsb_pacientes ADD COLUMN ultimo_procedimento TEXT"); } catch (e) {}
  
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS tsb_atendimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_nome TEXT NOT NULL,
        paciente_telefone TEXT,
        data TEXT NOT NULL,
        descricao TEXT,
        valor_total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS tsb_atendimento_procedimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        atendimento_id INTEGER NOT NULL,
        procedimento_nome TEXT NOT NULL,
        valor REAL NOT NULL,
        FOREIGN KEY (atendimento_id) REFERENCES tsb_atendimentos(id) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    console.error("Erro ao criar tabelas de atendimento TSB:", e);
  }
};

const verifyTsbToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto_padrao');
    if (decoded.role !== 'tsb') return res.status(401).json({ error: 'Acesso não autorizado para a Clínica' });
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const tsbUser = process.env.TSB_USER || 'aline';
    const tsbPass = process.env.TSB_PASS || 'tsb123';

    if (username === tsbUser && password === tsbPass) {
      const token = jwt.sign(
        { username, role: 'tsb' },
        process.env.JWT_SECRET || 'secreto_padrao',
        { expiresIn: '24h' }
      );
      return res.json({ token });
    }
    res.status(401).json({ error: 'Usuário ou senha incorretos' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// =========================================================================
// GESTÃO DE PACIENTES E RECORRÊNCIAS (ABA 1)
// =========================================================================

router.get('/', verifyTsbToken, async (req, res) => {
  await garantirTabelasTsb();
  try {
    const pacientes = await all('SELECT * FROM tsb_pacientes ORDER BY nome ASC');
    res.json(pacientes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar pacientes TSB' });
  }
});

router.post('/', verifyTsbToken, async (req, res) => {
  await garantirTabelasTsb();
  try {
    const { nome, telefone, procedimento, ultimo_procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query(
      `INSERT INTO tsb_pacientes (nome, telefone, procedimento, ultimo_procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome.trim(), telefone || '', procedimento || '', ultimo_procedimento || '', recorrencia_meses || 6, data_inicio, ultimo_atendimento, proximo_atendimento]
    );
    res.status(201).json({ message: 'Paciente criado com sucesso', id: result.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar paciente TSB' });
  }
});

// --- ATUALIZAÇÃO IMPORTANTE: SINCRONIZAÇÃO AUTOMÁTICA COM O FINANCEIRO AO EDITAR ---
router.put('/:id', verifyTsbToken, async (req, res) => {
  await garantirTabelasTsb();
  try {
    const { id } = req.params;
    const { nome, telefone, procedimento, ultimo_procedimento, ultimo_procedimento_valor, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento } = req.body;

    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    await query(
      `UPDATE tsb_pacientes SET 
        nome = ?, telefone = ?, procedimento = ?, ultimo_procedimento = ?,
        recorrencia_meses = ?, data_inicio = ?, ultimo_atendimento = ?, proximo_atendimento = ?
       WHERE id = ?`,
      [nome.trim(), telefone || '', procedimento, ultimo_procedimento || '', recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento, id]
    );

    // Se a Aline inseriu um "Último Procedimento", o sistema injeta no relatório financeiro automaticamente
    if (ultimo_procedimento && ultimo_atendimento) {
      const atFinan = await get('SELECT id FROM tsb_atendimentos WHERE paciente_nome = ? AND data = ?', [nome.trim(), ultimo_atendimento]);
      
      if (!atFinan) {
        const valor = ultimo_procedimento_valor || 0;
        const resAt = await query(
          `INSERT INTO tsb_atendimentos (paciente_nome, paciente_telefone, data, descricao, valor_total) VALUES (?, ?, ?, ?, ?)`,
          [nome.trim(), telefone || '', ultimo_atendimento, 'Importado do Histórico de Retornos', valor]
        );
        await query(
          `INSERT INTO tsb_atendimento_procedimentos (atendimento_id, procedimento_nome, valor) VALUES (?, ?, ?)`,
          [resAt.lastID, ultimo_procedimento, valor]
        );
      }
    }

    res.json({ message: 'Paciente atualizado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar paciente TSB' });
  }
});

router.put('/:id/renovar', verifyTsbToken, async (req, res) => {
  await garantirTabelasTsb();
  try {
    const { id } = req.params;
    const paciente = await get('SELECT * FROM tsb_pacientes WHERE id = ?', [id]);
    if (!paciente) return res.status(404).json({ error: 'Paciente não encontrado' });

    const dataUltimo = new Date(paciente.proximo_atendimento + 'T00:00:00');
    const dataProximo = new Date(dataUltimo);
    dataProximo.setMonth(dataProximo.getMonth() + paciente.recorrencia_meses);

    const novoUltimoStr = dataUltimo.toISOString().split('T')[0];
    const novoProximoStr = dataProximo.toISOString().split('T')[0];

    await query(
      'UPDATE tsb_pacientes SET ultimo_atendimento = ?, proximo_atendimento = ? WHERE id = ?',
      [novoUltimoStr, novoProximoStr, id]
    );

    res.json({ message: 'Atendimento renovado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao renovar paciente' });
  }
});

router.delete('/:id', verifyTsbToken, async (req, res) => {
  await garantirTabelasTsb();
  try {
    const { id } = req.params;
    const paciente = await get('SELECT * FROM tsb_pacientes WHERE id = ?', [id]);
    if (!paciente) return res.status(404).json({ error: 'Paciente não encontrado' });

    await query('DELETE FROM tsb_pacientes WHERE id = ?', [id]);
    res.json({ message: 'Paciente deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao apagar paciente' });
  }
});

// =========================================================================
// GESTÃO FINANCEIRA E ATENDIMENTOS TSB (ABA 2)
// =========================================================================

router.get('/atendimentos', verifyTsbToken, async (req, res) => {
  try {
    await garantirTabelasTsb();
    const { periodo = 'mes' } = req.query;
    
    let condition = "";
    if (periodo === 'hoje') condition = "AND data = date('now', 'localtime')";
    else if (periodo === 'ontem') condition = "AND data = date('now', '-1 day', 'localtime')";
    else if (periodo === 'semana') condition = "AND data >= date('now', '-7 days', 'localtime')";
    else if (periodo === 'mes') condition = "AND data >= date('now', '-30 days', 'localtime')";
    else if (periodo === '3meses') condition = "AND data >= date('now', '-90 days', 'localtime')";

    const atendimentos = await all(`SELECT * FROM tsb_atendimentos WHERE 1=1 ${condition} ORDER BY data DESC, id DESC`);
    
    for (let at of atendimentos) {
      at.procedimentos = await all(`SELECT procedimento_nome as name, valor as value FROM tsb_atendimento_procedimentos WHERE atendimento_id = ?`, [at.id]);
    }
    
    res.json(atendimentos);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar atendimentos TSB' });
  }
});

router.post('/atendimentos', verifyTsbToken, async (req, res) => {
  try {
    await garantirTabelasTsb();
    const { paciente_nome, paciente_telefone, data, descricao, procedimentos, proximo_retorno_meses } = req.body;

    if (!paciente_nome || !data || !procedimentos || procedimentos.length === 0) {
      return res.status(400).json({ error: 'Preencha os dados do paciente e selecione os procedimentos.' });
    }

    const valor_total = procedimentos.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);

    const result = await query(
      `INSERT INTO tsb_atendimentos (paciente_nome, paciente_telefone, data, descricao, valor_total) VALUES (?, ?, ?, ?, ?)`,
      [paciente_nome.trim(), paciente_telefone || '', data, descricao || '', valor_total]
    );
    const atendimentoId = result.lastID;

    const procPrincipal = procedimentos[0]?.name || 'Prevenção / Rotina';

    for (let proc of procedimentos) {
      await query(
        `INSERT INTO tsb_atendimento_procedimentos (atendimento_id, procedimento_nome, valor) VALUES (?, ?, ?)`,
        [atendimentoId, proc.name, parseFloat(proc.value) || 0]
      );
    }

    if (proximo_retorno_meses && parseInt(proximo_retorno_meses) > 0) {
      const meses = parseInt(proximo_retorno_meses);
      const dataUltimo = new Date(data + 'T00:00:00');
      const dataProximo = new Date(dataUltimo);
      dataProximo.setMonth(dataProximo.getMonth() + meses);
      const novoProximoStr = dataProximo.toISOString().split('T')[0];

      const pacienteExistente = await get('SELECT id FROM tsb_pacientes WHERE TRIM(nome) LIKE ?', [paciente_nome.trim()]);
      
      if (pacienteExistente) {
        await query('UPDATE tsb_pacientes SET ultimo_atendimento = ?, proximo_atendimento = ?, recorrencia_meses = ?, ultimo_procedimento = ? WHERE id = ?', 
          [data, novoProximoStr, meses, procPrincipal, pacienteExistente.id]);
      } else {
        await query(`INSERT INTO tsb_pacientes (nome, telefone, procedimento, ultimo_procedimento, recorrencia_meses, data_inicio, ultimo_atendimento, proximo_atendimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [paciente_nome.trim(), paciente_telefone || '', procPrincipal, procPrincipal, meses, data, data, novoProximoStr]);
      }
    }

    res.status(201).json({ message: 'Atendimento registrado com sucesso', id: atendimentoId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar atendimento TSB' });
  }
});

router.put('/atendimentos/:id', verifyTsbToken, async (req, res) => {
  try {
    await garantirTabelasTsb();
    const { id } = req.params;
    const { paciente_nome, paciente_telefone, data, descricao, procedimentos } = req.body;

    if (!paciente_nome || !data || !procedimentos || procedimentos.length === 0) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
    }

    const valor_total = procedimentos.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);

    await query(
      `UPDATE tsb_atendimentos SET paciente_nome = ?, paciente_telefone = ?, data = ?, descricao = ?, valor_total = ? WHERE id = ?`,
      [paciente_nome.trim(), paciente_telefone || '', data, descricao || '', valor_total, id]
    );

    await query(`DELETE FROM tsb_atendimento_procedimentos WHERE atendimento_id = ?`, [id]);
    for (let proc of procedimentos) {
      await query(
        `INSERT INTO tsb_atendimento_procedimentos (atendimento_id, procedimento_nome, valor) VALUES (?, ?, ?)`,
        [id, proc.name, parseFloat(proc.value) || 0]
      );
    }

    res.json({ message: 'Atendimento atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar atendimento TSB' });
  }
});

router.delete('/atendimentos/:id', verifyTsbToken, async (req, res) => {
  try {
    await query(`DELETE FROM tsb_atendimento_procedimentos WHERE atendimento_id = ?`, [req.params.id]);
    await query(`DELETE FROM tsb_atendimentos WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Atendimento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir atendimento TSB' });
  }
});

export default router;
