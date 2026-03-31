import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from app.core.config import settings

logger = logging.getLogger(__name__)

def send_approval_email(to_email: str, doc_title: str, drafter_name: str, reference_id: str):
    if not to_email:
        logger.warning(f"수신자 이메일이 없어 메일 발송을 취소합니다. (참조문서: {reference_id})")
        return

    subject = f"[결재요청] {drafter_name}님의 '{doc_title}' 결재가 대기 중입니다."
    # 실서버 URL 기준 링크 생성
    doc_url = f"https://dmmes.synology.me/approval" 

    html_content = f"""
    <html>
        <body style="font-family: 'Malgun Gothic', sans-serif; color: #333;">
            <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; max-width: 600px;">
                <h2 style="color: #003AC1;">결재 요청 알림</h2>
                <p><strong>{drafter_name}</strong>님이 상신한 문서의 결재 순서가 도래했습니다.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #003AC1; margin: 15px 0;">
                    <p style="margin: 0;"><strong>문서 제목:</strong> {doc_title}</p>
                </div>
                <p>아래 버튼을 클릭하여 MES 시스템에서 결재를 진행해 주십시오.</p>
                <a href="{doc_url}" style="display: inline-block; padding: 10px 20px; background-color: #003AC1; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">결재 문서 확인하기</a>
            </div>
        </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    # 🚨 수정 포인트: 다음 SMTP 스팸 필터를 통과하기 위한 표준 발신자 포맷팅
    msg["From"] = formataddr(("디자인메카 결재시스템", settings.SMTP_SENDER))
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html"))

    try:
        logger.info(f"메일 발송 시도: {to_email}")
        with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            # server.set_debuglevel(1) # 필요시 주석 해제하여 상세 로그 확인
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_SENDER, to_email, msg.as_string())
        logger.info(f"메일 발송 성공: {to_email}")
    except Exception as e:
        # 백그라운드 에러를 확실히 잡기 위해 에러 로그 출력
        logger.error(f"[SMTP ERROR] 메일 발송 실패 ({to_email}): {str(e)}")

def send_sysadmin_email(to_emails: list, subject: str, content: str, sender_name: str):
    if not to_emails: return
    
    real_subject = f"[MES 시스템 문의] {sender_name}님의 요청: {subject}"
    html_content = f"""
    <html>
        <body style="font-family: sans-serif; color: #333;">
            <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h2 style="color: #d32f2f;">🛠️ 시스템 관리자 호출</h2>
                <p><strong>발신자:</strong> {sender_name}</p>
                <hr />
                <p style="white-space: pre-wrap;">{content}</p>
            </div>
        </body>
    </html>
    """
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = real_subject
    msg["From"] = formataddr(("MES 시스템", settings.SMTP_SENDER))
    msg["To"] = ", ".join(to_emails)
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_SENDER, to_emails, msg.as_string())
    except Exception as e:
        logger.error(f"Sysadmin email failed: {e}")
def send_accounting_completion_email(to_email: str, doc_title: str, drafter_name: str, doc_id: int):
    if not to_email: return

    subject = f"[결재완료/집행안내] '{doc_title}' 문서가 최종 승인되었습니다."
    doc_url = f"https://dmmes.synology.me/approval" 

    html_content = f"""
    <html>
        <body style="font-family: 'Malgun Gothic', sans-serif; color: #333;">
            <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; max-width: 600px;">
                <h2 style="color: #2e7d32;">결재 완료 및 집행 안내</h2>
                <p>아래 결재 문서가 최종 승인되었음을 알려드립니다. 회계 담당자께서는 내용을 확인하시어 필요한 집행 절차를 진행해 주시기 바랍니다.</p>
                <div style="background-color: #f1f8e9; padding: 15px; border-left: 4px solid #2e7d32; margin: 15px 0;">
                    <p style="margin: 0;"><strong>문서 제목:</strong> {doc_title}</p>
                    <p style="margin: 5px 0 0 0;"><strong>기안자:</strong> {drafter_name}</p>
                </div>
                <p>아래 버튼을 클릭하여 MES 시스템에서 상세 내용을 확인하실 수 있습니다.</p>
                <a href="{doc_url}" style="display: inline-block; padding: 10px 20px; background-color: #2e7d32; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">결재 문서 확인하기</a>
            </div>
        </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr(("디자인메카 결재시스템", settings.SMTP_SENDER))
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_SENDER, to_email, msg.as_string())
        logger.info(f"회계 알림 메일 발송 성공: {to_email}")
    except Exception as e:
        logger.error(f"[SMTP ERROR] 회계 메일 발송 실패 ({to_email}): {str(e)}")
