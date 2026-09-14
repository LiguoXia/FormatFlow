import { appVersion } from './version';
export const jsonSample = `{
  "name": "FormatFlow",
  "version": "${appVersion}",
  "description": "让文本井然有序，让工作心无旁骛。",
  "localFirst": true,
  "workspace": {
    "theme": "light",
    "indentSize": 2,
    "language": "zh-CN"
  },
  "tools": [
    { "id": "json", "name": "JSON 格式化", "enabled": true },
    { "id": "sql", "name": "SQL 格式化", "enabled": true },
    { "id": "timestamp", "name": "时间戳转换", "enabled": true },
    { "id": "config", "name": "配置转换", "enabled": true }
  ],
  "lastOpened": null
}`;
export const sqlSample = `select u.id, u.name, count(o.id) as order_count, sum(o.total) as total_spent from users u left join orders o on u.id = o.user_id where u.status = 'active' and o.created_at >= '2026-01-01' group by u.id, u.name having count(o.id) > 0 order by total_spent desc limit 20;`;
export const propertiesSample = `# Application configuration
server.port=8080
server.host=localhost

# Data source
spring.datasource.url=jdbc:mysql://localhost:3306/formatflow
spring.datasource.username=root
spring.datasource.pool-size=10

app.name=FormatFlow
app.enabled=true`;
export const yamlSample = `# Application configuration
server:
  port: 8080
  host: localhost
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/formatflow
    username: root
    pool-size: 10
app:
  name: FormatFlow
  enabled: true
`;
