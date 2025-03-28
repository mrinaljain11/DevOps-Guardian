# DevOps-Guardian Deployment Guide

![DevOps-Guardian Logo](./generated-icon.png)

DevOps-Guardian is a comprehensive service health tracking and monitoring platform designed for modern DevOps teams. This guide will walk you through the deployment process on an AWS EC2 instance.

## Table of Contents

- [Prerequisites](#prerequisites)
- [System Requirements](#system-requirements)
- [Installation Steps](#installation-steps)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Nginx Setup](#nginx-setup)
- [SSL Configuration with Let's Encrypt](#ssl-configuration-with-lets-encrypt)
- [Monitoring Setup](#monitoring-setup)
- [Troubleshooting](#troubleshooting)
- [Maintenance Procedures](#maintenance-procedures)

## Prerequisites

Before you begin, ensure you have:

- An AWS account with EC2 access
- Domain name (for SSL and public access)
- SSH access to your server
- Basic knowledge of Linux server administration

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU       | 2 vCPU  | 4 vCPU      |
| RAM       | 4 GB    | 8 GB        |
| Storage   | 20 GB   | 40 GB       |
| OS        | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

## Installation Steps

### 1. Launch EC2 Instance

1. Launch an EC2 instance with the following specifications:
   - Ubuntu 22.04 LTS
   - t3.medium (2 vCPU, 4 GB RAM) or larger
   - At least 20 GB EBS storage
   - Security group with ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open

2. Connect to your instance via SSH:
   ```bash
   ssh -i your-key.pem ubuntu@your-instance-ip
   ```

### 2. Update System and Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install additional dependencies
sudo apt install -y build-essential python3-pip git certbot python3-certbot-nginx
```

### 3. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/devops-guardian
sudo chown ubuntu:ubuntu /opt/devops-guardian

# Clone repository
git clone https://github.com/your-organization/devops-guardian.git /opt/devops-guardian
cd /opt/devops-guardian

# Install dependencies
npm install
```

## Database Setup

### 1. Configure PostgreSQL

```bash
# Create a database user and database
sudo -u postgres psql -c "CREATE USER guardianuser WITH PASSWORD 'your-secure-password';"
sudo -u postgres psql -c "CREATE DATABASE devopsguardian OWNER guardianuser;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE devopsguardian TO guardianuser;"

# Enable remote connections (if needed)
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/14/main/postgresql.conf
echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a /etc/postgresql/14/main/pg_hba.conf
sudo systemctl restart postgresql
```

### 2. Run Migrations

```bash
# Navigate to application directory
cd /opt/devops-guardian

# Run database migrations
npm run db:push
```

## Configuration

### 1. Environment Variables

Create a `.env` file in the application root directory:

```bash
cat > /opt/devops-guardian/.env << EOF
# Database Configuration
DATABASE_URL=postgresql://guardianuser:your-secure-password@localhost:5432/devopsguardian
PGUSER=guardianuser
PGHOST=localhost
PGPASSWORD=your-secure-password
PGDATABASE=devopsguardian
PGPORT=5432

# Application Configuration
PORT=5000
NODE_ENV=production
SESSION_SECRET=your-session-secret

# Email Configuration (for alerts)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=alerts@your-domain.com

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Logging Configuration
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/devops-guardian/application.log
EOF
```

### 2. Global Configuration

The application uses a centralized configuration pattern. The main configuration file is located at `server/config.ts` which centralizes all settings:

```typescript
/**
 * Global configuration for DevOps-Guardian
 * This file centralizes all configuration settings for the application.
 */

// Database configuration
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle({ client: pool, schema });

// Session configuration
export const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
  },
  resave: false,
  saveUninitialized: false,
};

// Server configuration
export const serverConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
};

// Monitoring configuration
export const monitoringConfig = {
  defaultCheckInterval: 60, // seconds
  defaultTimeout: 30, // seconds
  maxRetries: 3,
  retryDelay: 5, // seconds
  metricRetention: 365, // days
};

// Notification configuration
export const notificationConfig = {
  email: {
    enabled: process.env.SMTP_HOST ? true : false,
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    from: process.env.EMAIL_FROM || 'alerts@devops-guardian.com',
  },
  sms: {
    enabled: process.env.TWILIO_ACCOUNT_SID ? true : false,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  call: {
    enabled: process.env.TWILIO_ACCOUNT_SID ? true : false,
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
};

// Auth configuration
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
  jwtExpiresIn: '7d',
  bcryptSaltRounds: 12,
};
```

### 3. PM2 Process Manager

Install and configure PM2 to manage the Node.js process:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 configuration file
cat > /opt/devops-guardian/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: "devops-guardian",
    script: "server/index.ts",
    instances: "max",
    exec_mode: "cluster",
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
}
EOF

# Start application with PM2
cd /opt/devops-guardian
pm2 start ecosystem.config.js

# Configure PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

## Nginx Setup

### 1. Create Nginx Configuration

```bash
sudo tee /etc/nginx/sites-available/devops-guardian << EOF
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/devops-guardian /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Configuration with Let's Encrypt

```bash
# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

## Monitoring Setup

### 1. Configure System Monitoring

```bash
# Install Node Exporter for Prometheus metrics
wget https://github.com/prometheus/node_exporter/releases/download/v1.5.0/node_exporter-1.5.0.linux-amd64.tar.gz
tar xvfz node_exporter-1.5.0.linux-amd64.tar.gz
sudo mv node_exporter-1.5.0.linux-amd64/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter

# Create systemd service file
sudo tee /etc/systemd/system/node_exporter.service << EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

# Start and enable the service
sudo systemctl daemon-reload
sudo systemctl start node_exporter
sudo systemctl enable node_exporter
```

### 2. Application Logs

Create log directory and configure permissions:

```bash
sudo mkdir -p /var/log/devops-guardian
sudo chown ubuntu:ubuntu /var/log/devops-guardian
```

## Troubleshooting

### Common Issues and Solutions

1. **Application Not Starting**:
   - Check logs: `pm2 logs devops-guardian`
   - Verify environment variables
   - Ensure database is running: `sudo systemctl status postgresql`

2. **Database Connection Issues**:
   - Verify PostgreSQL is running: `sudo systemctl status postgresql`
   - Check connection parameters in `.env` file
   - Test connection: `psql -U guardianuser -h localhost -d devopsguardian`

3. **Nginx Proxy Issues**:
   - Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
   - Verify Nginx configuration: `sudo nginx -t`
   - Ensure application is running: `curl http://localhost:5000`

4. **SSL Certificate Issues**:
   - Renew certificate: `sudo certbot renew`
   - Check certificate status: `sudo certbot certificates`

## Maintenance Procedures

### Backup and Restore

#### Database Backup

```bash
# Backup database
pg_dump -U guardianuser -h localhost devopsguardian > /tmp/devopsguardian_backup_$(date +%Y%m%d).sql

# Compress backup
gzip /tmp/devopsguardian_backup_$(date +%Y%m%d).sql

# Copy to backup location (e.g., S3)
aws s3 cp /tmp/devopsguardian_backup_$(date +%Y%m%d).sql.gz s3://your-backup-bucket/
```

#### Database Restore

```bash
# Download backup
aws s3 cp s3://your-backup-bucket/devopsguardian_backup_YYYYMMDD.sql.gz /tmp/

# Uncompress backup
gunzip /tmp/devopsguardian_backup_YYYYMMDD.sql.gz

# Restore database
psql -U guardianuser -h localhost -d devopsguardian < /tmp/devopsguardian_backup_YYYYMMDD.sql
```

### Application Updates

```bash
# Navigate to application directory
cd /opt/devops-guardian

# Pull latest changes
git pull

# Install dependencies
npm install

# Run migrations
npm run db:push

# Restart application
pm2 restart devops-guardian
```

## Screenshots

### DevOps-Guardian Dashboard

![Dashboard Screenshot](./attached_assets/image_1743149344589.png)

### Service Monitoring Page

![Monitoring Screenshot](https://via.placeholder.com/800x450?text=Service+Monitoring+Screenshot)

### Alert Configuration

![Alerts Screenshot](https://via.placeholder.com/800x450?text=Alert+Configuration+Screenshot)

## Third-Party Integrations

### Email Services (SMTP)

DevOps-Guardian supports any SMTP-compatible email service:

- Amazon SES
- SendGrid
- Mailgun
- Gmail (for testing only)

Configuration is centralized in the `notificationConfig` section of `server/config.ts`.

### SMS/Call Notifications (Twilio)

For SMS and phone call alerts, we use Twilio:

1. Create a Twilio account at [twilio.com](https://www.twilio.com)
2. Obtain your Account SID and Auth Token
3. Purchase a phone number for sending SMS/making calls
4. Update the `.env` file with your Twilio credentials

### Metrics Visualization (Optional)

For advanced metrics visualization:

1. Install Grafana: `sudo apt install -y grafana`
2. Configure Grafana datasource to point to the PostgreSQL database
3. Import the provided dashboard JSON from `./grafana-dashboards/`

## Support

For questions or issues:

- Open an issue on GitHub: [github.com/your-organization/devops-guardian/issues](https://github.com/your-organization/devops-guardian/issues)
- Contact support: support@devops-guardian.com

---

© 2025 DevOps-Guardian. All rights reserved.