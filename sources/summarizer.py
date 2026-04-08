"""Summarize articles in Portuguese using Claude Haiku."""
import json
import os
import anthropic
from utils.logger import get_logger

log = get_logger()

PROMPT_TEMPLATE = """Você é um jornalista especializado em Inteligência Artificial.
Hoje é {date}.

Abaixo estão notícias recentes sobre IA coletadas de diversas fontes.

Sua tarefa:
1. Para cada notícia, escreva um resumo DETALHADO em português brasileiro com entre 8 e 12 linhas.
   - Explique o contexto completo
   - O que aconteceu ou foi anunciado
   - Quem está envolvido (empresas, pesquisadores, etc.)
   - Qual o impacto ou implicação para o setor de IA
   - Seja informativo, claro e acessível
2. Traduza o título para português brasileiro natural
3. Mantenha a URL e a fonte originais

Retorne APENAS um JSON válido neste formato, sem texto adicional:
{{
  "articles": [
    {{
      "url": "url original",
      "title": "Título em português",
      "source": "nome da fonte",
      "published_time": "HH:MM",
      "summary": "Resumo com 12 frases em português."
    }}
  ]
}}

NOTÍCIAS:
{articles_text}"""


def summarize(articles: list[dict], api_key: str, run_date_str: str) -> list[dict]:
    """Send articles to Claude and return enriched list with PT summaries."""
    if not articles:
        return []

    client = anthropic.Anthropic(api_key=api_key)

    articles_text = ""
    for i, a in enumerate(articles, 1):
        pub = a["published_utc"]
        time_str = pub.strftime("%H:%M") if pub else "--:--"
        articles_text += f"\n[{i}]\n"
        articles_text += f"URL: {a['url']}\n"
        articles_text += f"TÍTULO: {a['title']}\n"
        articles_text += f"FONTE: {a['source']}\n"
        articles_text += f"HORA: {time_str}\n"
        if a.get("summary"):
            articles_text += f"DESCRIÇÃO: {a['summary'][:300]}\n"

    prompt = PROMPT_TEMPLATE.format(
        date=run_date_str,
        articles_text=articles_text,
    )

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text.strip()

        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        data = json.loads(response_text)
        enriched = data.get("articles", [])
        log.info(f"Claude resumiu {len(enriched)} artigos")
        return enriched

    except json.JSONDecodeError as e:
        log.error(f"JSON inválido do Claude: {e}")
        return _fallback(articles)
    except Exception as e:
        log.error(f"Erro no Claude: {e}")
        return _fallback(articles)


def _fallback(articles: list[dict]) -> list[dict]:
    """Return articles with raw summary if Claude fails."""
    result = []
    for a in articles:
        pub = a["published_utc"]
        result.append({
            "url": a["url"],
            "title": a["title"],
            "source": a["source"],
            "published_time": pub.strftime("%H:%M") if pub else "--:--",
            "summary": a.get("summary", ""),
        })
    return result
