#!/usr/bin/env python3
"""
Сервис авторизации Telegram аккаунтов через Telethon
Интегрирован с системой tg_accounts
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from telethon import TelegramClient
from telethon import errors as te
from telethon.sessions import StringSession

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Разрешаем все источники

# Базовая директория для сессий
BASE_SESSION_PATH = Path(__file__).parent / 'session'

# Загружаем API из main/.env
MAIN_ENV_PATH = BASE_SESSION_PATH / 'main' / '.env'
if MAIN_ENV_PATH.exists():
    load_dotenv(MAIN_ENV_PATH)
else:
    # Fallback на корневой .env
    load_dotenv(BASE_SESSION_PATH.parent / '.env')

API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')

if not API_ID or not API_HASH:
    print(f"❌ ERROR: API credentials not found in {MAIN_ENV_PATH}")
    sys.exit(1)

print(f"✅ Loaded API: API_ID={API_ID}, API_HASH={API_HASH[:8]}...")

# Хранилище временных данных авторизации
auth_sessions: Dict[str, Dict[str, Any]] = {}


@app.route('/health', methods=['GET'])
def health():
    """Проверка работоспособности сервиса"""
    return jsonify({'status': 'ok', 'api_id': API_ID})


@app.route('/auth/send_code', methods=['POST', 'OPTIONS'])
def send_code():
    """Отправка кода подтверждения на номер телефона"""
    if request.method == 'OPTIONS':
        # Обработка preflight запроса
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        phone = data.get('phone')
        session_id = data.get('session_id')  # Уникальный ID сессии от Node.js
        
        if not phone or not session_id:
            return jsonify({'error': 'phone and session_id are required'}), 400
        
        print(f"[AuthService] Sending code to {phone}, session_id: {session_id}")
        
        # Запускаем асинхронную функцию
        result = asyncio.run(_send_code_async(phone, session_id))
        print(f"[AuthService] Result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"[AuthService] Error in send_code: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500


async def _send_code_async(phone: str, session_id: str) -> Dict[str, Any]:
    """Асинхронная отправка кода"""
    client = None
    try:
        # Создаем клиент с пустой сессией
        tg_session = StringSession('')
        client = TelegramClient(tg_session, API_ID, API_HASH)
        
        print(f"[AuthService] Connecting to Telegram...")
        await client.connect()
        print(f"[AuthService] ✅ Connected to Telegram")
        
        # Отправляем код
        print(f"[AuthService] Sending code request to {phone}...")
        try:
            result = await client.send_code_request(phone)
            phone_code_hash = result.phone_code_hash
            print(f"[AuthService] ✅ Code sent, phone_code_hash received")
            
            # Сохраняем данные сессии
            # После send_code_request сессия может обновиться, поэтому сохраняем из client.session
            session_string = ''
            try:
                # Пробуем получить сессию из client.session (обновленная версия)
                if hasattr(client, 'session') and hasattr(client.session, 'save'):
                    session_string = client.session.save()
                # Если не получилось, пробуем из объекта tg_session
                if not session_string and hasattr(tg_session, 'save'):
                    session_string = tg_session.save()
            except Exception as e:
                print(f"[AuthService] ⚠️ Warning: Could not save session string: {e}")
            
            auth_sessions[session_id] = {
                'phone': phone,
                'phone_code_hash': phone_code_hash,
                'session_string': session_string,
                'client_session': session_string,  # Сохраняем строку сессии
            }
            print(f"[AuthService] ✅ Session data saved for session_id: {session_id}, session_string length: {len(session_string)}")
            
            return {
                'success': True,
                'phone_code_hash': phone_code_hash,
                'message': 'Code sent successfully'
            }
        except te.PhoneNumberInvalidError:
            return {'error': 'PHONE_INVALID', 'message': 'Invalid phone number format'}
        except te.PhoneNumberUnoccupiedError:
            return {'error': 'PHONE_NOT_REGISTERED', 'message': 'Phone number not registered'}
        except te.FloodWaitError as e:
            return {'error': 'FLOOD_WAIT', 'message': f'Wait {e.seconds} seconds', 'seconds': e.seconds}
        except Exception as e:
            return {'error': 'SEND_CODE_ERROR', 'message': str(e)}
    except Exception as e:
        return {'error': 'CONNECTION_ERROR', 'message': str(e)}
    finally:
        if client:
            await client.disconnect()


@app.route('/auth/sign_in', methods=['POST'])
def sign_in():
    """Вход с кодом подтверждения"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        session_id = data.get('session_id')
        code = data.get('code')
        folder_name = data.get('folder_name')  # Куда сохранить сессию
        
        if not session_id or not code or not folder_name:
            return jsonify({'error': 'session_id, code, and folder_name are required'}), 400
        
        if session_id not in auth_sessions:
            return jsonify({'error': 'Session not found. Please send code first.'}), 404
        
        result = asyncio.run(_sign_in_async(session_id, code, folder_name))
        return jsonify(result)
    except Exception as e:
        print(f"[AuthService] Error in sign_in: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'type': type(e).__name__}), 500


async def _sign_in_async(session_id: str, code: str, folder_name: str) -> Dict[str, Any]:
    """Асинхронный вход с кодом"""
    client = None
    tg_session = None
    try:
        # Получаем данные сессии
        if session_id not in auth_sessions:
            return {'error': 'SESSION_NOT_FOUND', 'message': 'Session not found. Please send code first.'}
            
        session_data = auth_sessions[session_id]
        phone = session_data.get('phone')
        phone_code_hash = session_data.get('phone_code_hash')
        
        if not phone or not phone_code_hash:
            return {'error': 'SESSION_DATA_ERROR', 'message': 'Missing phone or phone_code_hash in session data'}
        
        # Восстанавливаем сессию из сохраненной строки
        saved_session_string = session_data.get('client_session', '') or session_data.get('session_string', '')
        
        # Создаем сессию из сохраненной строки
        try:
            tg_session = StringSession(saved_session_string)
            client = TelegramClient(tg_session, API_ID, API_HASH)
        except Exception as e:
            print(f"[AuthService] ❌ Error creating session: {e}")
            import traceback
            traceback.print_exc()
            return {'error': 'SESSION_CREATION_ERROR', 'message': f'Failed to create session: {str(e)}'}
        
        print(f"[AuthService] Connecting to Telegram for sign_in...")
        await client.connect()
        print(f"[AuthService] ✅ Connected to Telegram")
        
        try:
            # Входим с кодом
            print(f"[AuthService] Attempting sign_in with code...")
            print(f"[AuthService] Using phone_code_hash: {phone_code_hash[:10]}...")
            await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
            print(f"[AuthService] ✅ Sign_in successful")
        except te.SessionPasswordNeededError:
            # Требуется 2FA пароль (пока не поддерживаем)
            await client.disconnect()
            return {
                'error': 'PASSWORD_NEEDED',
                'message': '2FA password required (not supported yet)'
            }
        except te.PhoneCodeInvalidError:
            await client.disconnect()
            return {'error': 'CODE_INVALID', 'message': 'Invalid verification code'}
        except te.PhoneCodeExpiredError:
            await client.disconnect()
            return {'error': 'CODE_EXPIRED', 'message': 'Verification code expired'}
        except Exception as e:
            await client.disconnect()
            print(f"[AuthService] Error during sign_in: {e}")
            return {'error': 'SIGN_IN_ERROR', 'message': f'Sign in failed: {str(e)}'}
        
        # Проверяем авторизацию
        if not await client.is_user_authorized():
            await client.disconnect()
            return {'error': 'AUTH_FAILED', 'message': 'Authorization failed'}
        
        # Получаем информацию об аккаунте
        me = await client.get_me()
        user_id = me.id
        username = me.username
        
        print(f"[AuthService] ✅ User authorized: {user_id} (@{username})")
        
        # Сохраняем сессию ПЕРЕД отключением
        # После успешного sign_in, сессия обновляется в client.session
        # Нужно получить обновленную строку сессии
        session_string = client.session.save() if hasattr(client.session, 'save') else ''
        
        if not session_string and tg_session:
            # Fallback: пробуем получить из объекта tg_session
            session_string = tg_session.save() if hasattr(tg_session, 'save') else ''
        
        if not session_string:
            print(f"[AuthService] ⚠️ Warning: Could not get session string, but user is authorized")
            # Пробуем получить сессию через client.session напрямую
            try:
                # Если клиент авторизован, мы можем попробовать сохранить через client.session
                if hasattr(client, 'session') and hasattr(client.session, 'save'):
                    session_string = client.session.save()
                    print(f"[AuthService] ✅ Got session string from client.session")
            except Exception as e:
                print(f"[AuthService] ⚠️ Error trying to save session: {e}")
        
        # Отключаемся
        await client.disconnect()
        
        # Сохраняем сессию в файл
        folder_path = BASE_SESSION_PATH / folder_name
        folder_path.mkdir(parents=True, exist_ok=True)
        
        # Имя файла: только цифры из номера телефона
        sanitized_phone = ''.join(filter(str.isdigit, phone))
        session_file = folder_path / f'{sanitized_phone}.session'
        
        if session_string:
            # Сохраняем строку сессии
            with open(session_file, 'w') as f:
                f.write(session_string)
            print(f"[AuthService] ✅ Session saved to {session_file}")
        else:
            print(f"[AuthService] ⚠️ CRITICAL: Session string is empty! Session file may not work.")
            # Все равно создаем файл, но он может быть нерабочим
            with open(session_file, 'w') as f:
                f.write('')  # Пустой файл
        
        # Удаляем временные данные
        if session_id in auth_sessions:
            del auth_sessions[session_id]
        
        return {
            'success': True,
            'telegram_id': user_id,
            'username': username,
            'session_path': f'{folder_name}/{sanitized_phone}.session',
            'message': 'Account authorized successfully'
        }
    except KeyError as e:
        error_msg = f'Missing data in session: {str(e)}'
        print(f"[AuthService] ❌ {error_msg}")
        if client:
            await client.disconnect()
        return {'error': 'SESSION_DATA_ERROR', 'message': error_msg}
    except Exception as e:
        error_msg = str(e)
        print(f"[AuthService] ❌ Unexpected error: {error_msg}")
        import traceback
        traceback.print_exc()
        if client:
            try:
                await client.disconnect()
            except:
                pass
        return {'error': 'SIGN_IN_ERROR', 'message': error_msg}


@app.route('/auth/cancel', methods=['POST', 'OPTIONS'])
def cancel_auth():
    """Отмена процесса авторизации"""
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if session_id and session_id in auth_sessions:
            del auth_sessions[session_id]
            return jsonify({'success': True, 'message': 'Auth session cancelled'})
        return jsonify({'error': 'Session not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('AUTH_SERVICE_PORT', '5001'))
    print(f"🚀 Starting Telegram Auth Service...")
    print(f"📁 Session path: {BASE_SESSION_PATH}")
    print(f"🔑 API_ID: {API_ID}")
    print(f"🌐 Server will run on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)

