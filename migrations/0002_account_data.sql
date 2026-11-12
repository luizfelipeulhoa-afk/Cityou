-- Liga a conta aos dados que a pessoa já tinha na demonstração: `data_key` é o nome do Durable Object
-- (DemoSession) que guarda os registros dela. Ver worker/auth.js.
ALTER TABLE users ADD COLUMN data_key TEXT;
CREATE UNIQUE INDEX users_data_key ON users(data_key);
