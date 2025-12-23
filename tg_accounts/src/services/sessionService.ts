import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env';

/**
 * Сервис для управления папками и сессиями аккаунтов
 */
export class SessionService {
  private baseSessionPath: string;

  constructor() {
    // Путь к папке session относительно корня проекта
    this.baseSessionPath = path.resolve(process.cwd(), 'session');
  }

  /**
   * Получает путь к папке сессий
   */
  getBaseSessionPath(): string {
    return this.baseSessionPath;
  }

  /**
   * Создает папку для аккаунтов, если её нет
   */
  ensureFolderExists(folderName: string): string {
    const folderPath = path.join(this.baseSessionPath, folderName);
    
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`[SessionService] ✅ Created folder: ${folderName}`);
    }
    
    return folderPath;
  }

  /**
   * Получает путь к файлу сессии
   */
  getSessionFilePath(folderName: string, phoneNumber: string): string {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const fileName = `${sanitizedPhone}.session`;
    return path.join(this.baseSessionPath, folderName, fileName);
  }

  /**
   * Получает относительный путь к сессии (для БД)
   */
  getSessionRelativePath(folderName: string, phoneNumber: string): string {
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const fileName = `${sanitizedPhone}.session`;
    return path.join(folderName, fileName).replace(/\\/g, '/'); // Нормализуем для разных ОС
  }

  /**
   * Проверяет, существует ли файл сессии
   */
  sessionExists(folderName: string, phoneNumber: string): boolean {
    const sessionPath = this.getSessionFilePath(folderName, phoneNumber);
    return fs.existsSync(sessionPath);
  }

  /**
   * Сохраняет сессию в файл
   */
  saveSession(folderName: string, phoneNumber: string, sessionString: string): void {
    this.ensureFolderExists(folderName);
    const sessionPath = this.getSessionFilePath(folderName, phoneNumber);
    fs.writeFileSync(sessionPath, sessionString);
    console.log(`[SessionService] ✅ Saved session: ${sessionPath}`);
  }

  /**
   * Загружает сессию из файла
   */
  loadSession(folderName: string, phoneNumber: string): string | null {
    const sessionPath = this.getSessionFilePath(folderName, phoneNumber);
    
    if (fs.existsSync(sessionPath)) {
      return fs.readFileSync(sessionPath, 'utf-8');
    }
    
    return null;
  }

  /**
   * Получает все папки с аккаунтами
   */
  getAllFolders(): string[] {
    if (!fs.existsSync(this.baseSessionPath)) {
      return [];
    }

    return fs.readdirSync(this.baseSessionPath)
      .filter((item: string) => {
        const itemPath = path.join(this.baseSessionPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
  }

  /**
   * Получает все сессии в папке
   */
  getSessionsInFolder(folderName: string): string[] {
    const folderPath = path.join(this.baseSessionPath, folderName);
    
    if (!fs.existsSync(folderPath)) {
      return [];
    }

    return fs.readdirSync(folderPath)
      .filter((file: string) => file.endsWith('.session'))
      .map((file: string) => file.replace('.session', ''));
  }

  /**
   * Определяет, в какую папку поместить новый аккаунт
   * main - максимум 4 аккаунта, остальные в twinks_1, twinks_2...
   */
  determineFolderForNewAccount(): string {
    const mainFolder = 'main';
    const mainSessions = this.getSessionsInFolder(mainFolder);
    
    // Если в main меньше 4 аккаунтов, добавляем туда
    if (mainSessions.length < 4) {
      return mainFolder;
    }

    // Иначе ищем первую папку twinks_X с менее чем 4 аккаунтами
    let twinksNumber = 1;
    while (true) {
      const folderName = `twinks_${twinksNumber}`;
      const sessions = this.getSessionsInFolder(folderName);
      
      if (sessions.length < 4) {
        return folderName;
      }
      
      twinksNumber++;
    }
  }

  /**
   * Получает полный путь к папке
   */
  getFolderPath(folderName: string): string {
    return path.join(this.baseSessionPath, folderName);
  }
}

