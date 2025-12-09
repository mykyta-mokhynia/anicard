import { spawn, ChildProcess } from 'child_process';

export type TunnelProvider = 'cloudflare' | 'localtunnel' | 'bore' | 'ngrok';

export interface Tunnel {
  start(port: number): Promise<string>;
  stop(): Promise<void>;
}

// Cloudflare Tunnel (cloudflared)
export class CloudflareTunnel implements Tunnel {
  private process: ChildProcess | null = null;

  async start(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      
      // Проверяем наличие cloudflared
      const checkCloudflared = spawn('which', ['cloudflared']);
      checkCloudflared.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(
            'cloudflared не установлен. Установите: brew install cloudflared (macOS) или скачайте с https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'
          ));
          return;
        }

        // Запускаем cloudflared
        const process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);
        this.process = process;
        
        if (!process.stdout || !process.stderr) {
          reject(new Error('Не удалось запустить cloudflared'));
          return;
        }

        let url = '';
        let errorOutput = '';

        process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          console.log(`[cloudflared] ${output}`);
          
          // Парсим URL из вывода
          const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (urlMatch && !url) {
            url = urlMatch[0];
            resolve(url);
          }
        });

        process.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          errorOutput += output;
          console.error(`[cloudflared stderr] ${output}`);
          
          // Также проверяем stderr на наличие URL
          const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (urlMatch && !url) {
            url = urlMatch[0];
            resolve(url);
          }
        });

        process.on('error', (error: Error) => {
          reject(error);
        });

        // Таймаут на случай, если URL не появится
        setTimeout(() => {
          if (!url) {
            reject(new Error('Не удалось получить URL от cloudflared. Проверьте вывод выше.'));
          }
        }, 10000);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// Localtunnel
export class LocaltunnelTunnel implements Tunnel {
  private tunnel: any = null;

  async start(port: number): Promise<string> {
    try {
      // Динамический импорт для localtunnel
      const localtunnel = require('localtunnel');
      
      this.tunnel = await localtunnel({ port });
      const url = this.tunnel.url;
      
      console.log(`✅ Localtunnel established: ${url}`);
      
      this.tunnel.on('close', () => {
        console.log('⚠️ Localtunnel closed');
      });
      
      return url;
    } catch (error: any) {
      console.error('❌ Failed to start localtunnel:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.tunnel) {
      await this.tunnel.close();
      this.tunnel = null;
      console.log('✅ Localtunnel closed');
    }
  }
}

// Bore.pub
export class BoreTunnel implements Tunnel {
  private process: ChildProcess | null = null;

  async start(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      
      // Проверяем наличие bore
      const checkBore = spawn('which', ['bore']);
      checkBore.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(
            'bore не установлен. Установите: cargo install bore-cli или скачайте с https://github.com/ekzhang/bore'
          ));
          return;
        }

        // Запускаем bore
        const process = spawn('bore', ['local', port.toString(), '--to', 'bore.pub']);
        this.process = process;
        
        if (!process.stdout || !process.stderr) {
          reject(new Error('Не удалось запустить bore'));
          return;
        }

        let url = '';
        let errorOutput = '';

        process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          console.log(`[bore] ${output}`);
          
          // Парсим URL из вывода
          const urlMatch = output.match(/https?:\/\/[^\s]+/);
          if (urlMatch && !url) {
            url = urlMatch[0];
            if (!url.startsWith('http')) {
              url = `https://${url}`;
            }
            resolve(url);
          }
        });

        process.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        process.on('error', (error: Error) => {
          reject(error);
        });

        setTimeout(() => {
          if (!url) {
            reject(new Error('Не удалось получить URL от bore. Проверьте вывод выше.'));
          }
        }, 10000);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// Ngrok (старая реализация)
export class NgrokTunnel implements Tunnel {
  async start(port: number): Promise<string> {
    try {
      // Динамический импорт для ngrok
      const ngrok = require('ngrok');
      const { config } = require('../config/env');
      
      const url = await ngrok.connect({
        addr: port,
        authtoken: config.ngrokAuthToken || undefined,
      });
      
      console.log(`✅ Ngrok tunnel established: ${url}`);
      return url;
    } catch (error: any) {
      console.error('❌ Failed to start ngrok tunnel:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      const ngrok = require('ngrok');
      await ngrok.disconnect();
      await ngrok.kill();
      console.log('✅ Ngrok tunnel closed');
    } catch (error) {
      console.error('❌ Failed to stop ngrok tunnel:', error);
    }
  }
}

// Фабрика для создания туннелей
export function createTunnel(provider: TunnelProvider): Tunnel {
  switch (provider) {
    case 'cloudflare':
      return new CloudflareTunnel();
    case 'localtunnel':
      return new LocaltunnelTunnel();
    case 'bore':
      return new BoreTunnel();
    case 'ngrok':
      return new NgrokTunnel();
    default:
      throw new Error(`Unknown tunnel provider: ${provider}`);
  }
}

