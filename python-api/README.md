# GLPI Manutenções - Python API

API FastAPI para integração com GLPI e gerenciamento de manutenções.

## 🚀 Instalação

### Desenvolvimento Local

```bash
# Criar ambiente virtual
python -m venv venv

# Ativar ambiente (Windows)
venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt

# Copiar .env.example para .env e configurar
cp .env.example .env

# Editar .env com suas credenciais GLPI
```

Se ao testar a API você receber `Access denied for user 'glpi_user'@'localhost'`, a senha do usuário no MySQL não está batendo com a do `.env`.

Para resetar a senha para `0000` usando PowerShell (vai pedir a senha do `root`):

```powershell
Set-Location "c:\Users\paulo\OneDrive\Documentos\Project"
Get-Content .\python-api\reset_glpi_user_password.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -p
```

### Docker

```bash
# No diretório raiz do projeto
docker-compose up -d
```

## 📡 Endpoints

### Sincronização GLPI

- `POST /api/sync/glpi` - Sincroniza computadores do GLPI manualmente
- `POST /api/webhook/glpi` - Webhook para sincronização automática

### Dispositivos

- `GET /api/devices` - Lista dispositivos (paginado, com filtros)
  - Query params: `tab`, `page`, `page_size`, `q`
- `GET /api/devices/{id}` - Detalhes do dispositivo
- `GET /api/devices/{id}/components` - Componentes de hardware
- `GET /api/devices/{id}/notes` - Notas do dispositivo
- `POST /api/devices/{id}/notes` - Adicionar nota
- `GET /api/devices/{id}/maintenance` - Histórico de manutenção

### Manutenção

- `POST /api/maintenance` - Registrar nova manutenção

### Outros

- `GET /api/health` - Health check

## 🗄️ Estrutura do Banco

### Tabelas

1. **computers** - Dados dos computadores
   - `id` (PK), `glpi_id` (unique), `name`, `entity`, `patrimonio`
   - `serial`, `location`, `status`
   - `last_maintenance`, `next_maintenance`
   - `glpi_data` (JSON), timestamps

2. **computer_components** - Componentes de hardware
   - `id` (PK), `computer_id` (FK)
   - `component_type`, `name`, `manufacturer`, `model`
   - `serial`, `capacity`, `component_data` (JSON)

3. **maintenance_history** - Histórico de manutenções
   - `id` (PK), `computer_id` (FK)
   - `maintenance_type` (Preventiva/Corretiva)
   - `description`, `performed_at`, `technician`
   - `next_due`, timestamps

4. **computer_notes** - Notas/comentários
   - `id` (PK), `computer_id` (FK)
   - `author`, `content`, timestamps

## 🔧 Configuração GLPI

1. Gerar App Token no GLPI
2. Gerar User Token no GLPI
3. Configurar no `.env`:

```env
GLPI_BASE_URL=http://suporte.barbacena.mg.gov.br:8585/glpi/apirest.php
GLPI_APP_TOKEN=seu_app_token
GLPI_USER_TOKEN=seu_user_token
```

### Problema comum: `ERROR_NOT_ALLOWED_IP`

Se o `initSession` retornar `ERROR_NOT_ALLOWED_IP`, o GLPI está bloqueando seu IP na configuração do **cliente da API**.
Entre em **Configurar/Setup → Geral/General → API → Clientes da API (API clients)** e, no cliente do seu `App-Token`, adicione o IP do servidor que está rodando a Python API.

Exemplo: se a mensagem mostrar `(172.16.1.254)`, é esse IP que precisa ser permitido.

## 🎯 Próximos Passos

- [ ] Autenticação JWT
- [ ] Permissões de usuário
- [ ] Agendamento automático de sincronização (cron)
- [ ] Notificações de manutenção vencida
- [ ] Relatórios e dashboards

## 📝 Logs

Os logs são salvos em `stdout` e podem ser visualizados com:

```bash
docker-compose logs -f python-api
```
