"""APScheduler: runs the pipeline 3x/day at Brasília time."""
import os
import sys
import subprocess
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo
from utils.logger import get_logger

log = get_logger()
TIMEZONE = ZoneInfo("America/Sao_Paulo")


def _run_pipeline(slot: str) -> None:
    log.info(f"▶ Iniciando rodada: {slot}")
    try:
        result = subprocess.run(
            [sys.executable, "main.py", "--slot", slot],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=False,
            timeout=600,
        )
        if result.returncode != 0:
            log.error(f"Pipeline terminou com código {result.returncode}")
        else:
            log.info(f"✔ Rodada {slot} concluída")
    except subprocess.TimeoutExpired:
        log.error(f"Timeout na rodada {slot}")
    except Exception as e:
        log.error(f"Erro na rodada {slot}: {e}")


def start() -> None:
    scheduler = BlockingScheduler(timezone=str(TIMEZONE))

    scheduler.add_job(
        lambda: _run_pipeline("manha"),
        CronTrigger(hour=8, minute=0, timezone=str(TIMEZONE)),
        id="manha", name="Rodada Manhã",
    )
    scheduler.add_job(
        lambda: _run_pipeline("tarde"),
        CronTrigger(hour=16, minute=0, timezone=str(TIMEZONE)),
        id="tarde", name="Rodada Tarde",
    )
    scheduler.add_job(
        lambda: _run_pipeline("noite"),
        CronTrigger(hour=22, minute=0, timezone=str(TIMEZONE)),
        id="noite", name="Rodada Noite",
    )

    log.info("Scheduler iniciado — rodadas: 08h | 16h | 22h (Brasília)")
    log.info("Pressione Ctrl+C para parar.")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler encerrado.")
