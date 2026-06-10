# Backend - LabPro | Gestão de Laboratório de Prótese Dentária

Sistema backend para gerenciamento de laboratório de prótese dentária. Desenvolvido com Node.js, Express e SQLite.

## 📋 Requisitos

- Node.js 16+ 
- npm ou yarn

## 🚀 Instalação

### 1. Clonar ou extrair o projeto

```bash
cd lab-protese-backend
```

### 2. Instalar dependências

```bash
npm install
# ou
yarn install
```

### 3. Configurar variáveis de ambiente

Criar arquivo `.env` na raiz do projeto:

```env
# Servidor
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=labprotese2026

# Admin padrão
ADMIN_USER=admin
ADMIN_PASS=123456
```

### 4. Executar o servidor

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm start
```

O servidor estará disponível em `http://localhost:3001`

## 📚 Endpoints da API

### Autenticação

**POST** `/api/auth/login`
- Realiza login do usuário
- Body: `{ "username": "admin", "password": "123456" }`
- Retorna: `{ "token": "...", "user": {...} }`

**GET** `/api/auth/me`
- Obtém dados do usuário autenticado
- Header: `Authorization: Bearer <token>`

### Dentistas

**GET** `/api/dentistas`
- Lista todos os dentistas

**GET** `/api/dentistas/:id`
- Obtém dentista por ID

**POST** `/api/dentistas`
- Cria novo dentista
- Body: `{ "nome": "...", "telefone": "...", "email": "...", "cpf": "..." }`

**PUT** `/api/dentistas/:id`
- Atualiza dentista

**DELETE** `/api/dentistas/:id`
- Deleta dentista

### Pacientes

**GET** `/api/pacientes`
- Lista todos os pacientes

**GET** `/api/pacientes/:id`
- Obtém paciente por ID

**POST** `/api/pacientes`
- Cria novo paciente
- Body: `{ "nome": "...", "telefone": "...", "email": "...", "cpf": "...", "data_nascimento": "..." }`

**PUT** `/api/pacientes/:id`
- Atualiza paciente

**DELETE** `/api/pacientes/:id`
- Deleta paciente

### Trabalhos/Serviços

**GET** `/api/trabalhos`
- Lista todos os trabalhos
- Query params: `status`, `data_inicio`, `data_fim`, `dentista_id`

**GET** `/api/trabalhos/:id`
- Obtém trabalho com etapas e custos

**POST** `/api/trabalhos`
- Cria novo trabalho
- Body: `{ "paciente_id": 1, "dentista_id": 1, "descricao": "...", "procedimento": "...", "data_entrada": "2026-06-08", "valor_bruto": 500, "observacoes": "..." }`

**PUT** `/api/trabalhos/:id`
- Atualiza trabalho

**DELETE** `/api/trabalhos/:id`
- Deleta trabalho (e etapas/custos relacionados)

### Etapas

**GET** `/api/etapas/trabalho/:trabalho_id`
- Lista etapas de um trabalho

**GET** `/api/etapas/:id`
- Obtém etapa por ID

**POST** `/api/etapas`
- Cria nova etapa
- Body: `{ "trabalho_id": 1, "nome": "...", "descricao": "...", "ordem": 1 }`

**PUT** `/api/etapas/:id`
- Atualiza etapa

**DELETE** `/api/etapas/:id`
- Deleta etapa

### Custos

**GET** `/api/custos/trabalho/:trabalho_id`
- Lista custos de um trabalho

**GET** `/api/custos/:id`
- Obtém custo por ID

**POST** `/api/custos`
- Cria novo custo
- Body: `{ "trabalho_id": 1, "descricao": "...", "tipo": "motoboy|insumo|outro", "valor": 50, "data": "2026-06-08", "observacoes": "..." }`

**PUT** `/api/custos/:id`
- Atualiza custo

**DELETE** `/api/custos/:id`
- Deleta custo

### Relatórios

**GET** `/api/relatorios/dashboard`
- Obtém KPIs do dashboard

**GET** `/api/relatorios/fluxo-caixa`
- Obtém relatório de fluxo de caixa
- Query params: `data_inicio`, `data_fim`

**GET** `/api/relatorios/resumo`
- Obtém resumo por período
- Query params: `periodo` (hoje|semana|mes|ano), `data_inicio`, `data_fim`

## 🗄️ Estrutura do Banco de Dados

### Tabelas

- **users**: Usuários do sistema (admin)
- **dentistas**: Cadastro de dentistas responsáveis
- **pacientes**: Cadastro de pacientes
- **trabalhos**: Trabalhos/serviços realizados
- **etapas**: Etapas do procedimento
- **custos**: Custos operacionais (motoboy, insumos, etc)

## 🔐 Autenticação

Todos os endpoints (exceto login) requerem autenticação via JWT.

**Header obrigatório:**
```
Authorization: Bearer <token>
```

O token é válido por 24 horas.

## 📝 Exemplo de Fluxo Completo

### 1. Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

### 2. Criar Dentista
```bash
curl -X POST http://localhost:3001/api/dentistas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"nome":"Dr. João","telefone":"11999999999","email":"joao@email.com","cpf":"12345678900"}'
```

### 3. Criar Paciente
```bash
curl -X POST http://localhost:3001/api/pacientes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"nome":"Maria Silva","telefone":"11988888888","email":"maria@email.com","cpf":"98765432100","data_nascimento":"1990-05-15"}'
```

### 4. Criar Trabalho
```bash
curl -X POST http://localhost:3001/api/trabalhos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"paciente_id":1,"dentista_id":1,"descricao":"Coroa dentária","procedimento":"Coroa de porcelana","data_entrada":"2026-06-08","valor_bruto":500,"observacoes":"Urgente"}'
```

### 5. Adicionar Custo
```bash
curl -X POST http://localhost:3001/api/custos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"trabalho_id":1,"descricao":"Motoboy","tipo":"motoboy","valor":50,"data":"2026-06-08"}'
```

### 6. Criar Etapa
```bash
curl -X POST http://localhost:3001/api/etapas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"trabalho_id":1,"nome":"Preparação","descricao":"Preparação do dente","ordem":1}'
```

### 7. Obter Dashboard
```bash
curl -X GET http://localhost:3001/api/relatorios/dashboard \
  -H "Authorization: Bearer <token>"
```

## 🔧 Integração com Frontend

Configure a URL da API no frontend:

```javascript
const API_BASE_URL = 'http://localhost:3001';
// ou em produção
const API_BASE_URL = 'https://seu-dominio.com';
```

Exemplo de requisição:
```javascript
const token = localStorage.getItem('token');
const response = await fetch(`${API_BASE_URL}/api/trabalhos`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 📦 Deploy na Easypanel

### 1. Preparar o projeto

```bash
npm install
```

### 2. Configurar variáveis de ambiente na Easypanel

- `PORT`: 3001
- `NODE_ENV`: production
- `JWT_SECRET`: sua-chave-secreta
- `ADMIN_USER`: seu-usuario
- `ADMIN_PASS`: sua-senha

### 3. Comando de inicialização

```bash
npm start
```

### 4. Conectar o frontend

Atualize a URL da API no frontend para apontar para seu domínio da Easypanel.

## 🐛 Troubleshooting

### Erro: "Database not initialized"
- Certifique-se de que o arquivo `labprotese.db` foi criado na pasta `database/`
- Verifique as permissões de escrita na pasta

### Erro: "Token inválido"
- Verifique se o token está sendo enviado corretamente no header
- Confirme que o `JWT_SECRET` é o mesmo em `.env`

### Erro: "CORS"
- O CORS está configurado para aceitar requisições de qualquer origem
- Se precisar restringir, edite o arquivo `server.js`

## 📄 Licença

MIT

## 👨‍💼 Suporte

Para dúvidas ou problemas, entre em contato com o desenvolvedor.

---

**Desenvolvido para Aline Antunes Prótese Odontológica**
