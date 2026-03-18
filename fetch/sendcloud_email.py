import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _parse_recipients(to_emails):
    if not to_emails:
        return []
    raw = str(to_emails).replace(';', ',')
    return [item.strip() for item in raw.split(',') if item.strip()]


def send_email_via_qq_smtp(mail_config, email_payload):
    smtp_server = mail_config.get('smtp_server', 'smtp.qq.com')
    smtp_port = int(mail_config.get('smtp_port', 465))
    smtp_user = mail_config.get('smtp_user', '').strip()
    smtp_auth_code = mail_config.get('smtp_auth_code', '').strip()
    from_email = mail_config.get('from_email', smtp_user).strip()
    from_name = mail_config.get('from_name', '').strip()
    to_emails = _parse_recipients(mail_config.get('to_emails', ''))

    if not smtp_user:
        raise ValueError('MAIL.smtp_user 未配置')
    if not smtp_auth_code:
        raise ValueError('MAIL.smtp_auth_code 未配置')
    if not from_email:
        raise ValueError('MAIL.from_email 未配置')
    if not to_emails:
        raise ValueError('MAIL.to_emails 未配置')

    message = MIMEMultipart('related')
    subject = email_payload.get('subject', 'NOTAM 变更通知')
    message['Subject'] = subject
    message['From'] = f'{from_name} <{from_email}>' if from_name else from_email
    # 保护收件人隐私：不在邮件头暴露群发地址列表
    message['To'] = 'undisclosed-recipients'

    alt_part = MIMEMultipart('alternative')
    plain_text = email_payload.get('body_text', '')
    html_text = email_payload.get('body_html', '')
    alt_part.attach(MIMEText(plain_text, 'plain', 'utf-8'))
    alt_part.attach(MIMEText(html_text, 'html', 'utf-8'))
    message.attach(alt_part)

    for image_item in email_payload.get('inline_images', []):
        data = image_item.get('data')
        cid = image_item.get('cid')
        filename = image_item.get('filename', 'inline.png')
        if not data or not cid:
            continue
        image_part = MIMEImage(data)
        image_part.add_header('Content-ID', f'<{cid}>')
        image_part.add_header('Content-Disposition', 'inline', filename=filename)
        message.attach(image_part)

    with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=30) as smtp:
        smtp.login(smtp_user, smtp_auth_code)
        smtp.sendmail(from_email, to_emails, message.as_string())

    return {
        'result': True,
        'to': to_emails,
        'subject': subject,
        'smtp_server': smtp_server,
        'smtp_port': smtp_port,
    }
