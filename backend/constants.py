"""XP curve, level titles, streak bonuses and predefined achievements."""
import math


def xp_to_level(xp: int) -> int:
    # clamp: XP can be driven down by undos/penalties and sqrt() of a negative
    # raises ValueError (used to 500 the whole request)
    return max(1, int(math.sqrt(max(0, xp) / 100)))


def xp_for_level(level: int) -> int:
    return level ** 2 * 100


LEVEL_TITLES = {
    1: "Iniciado",
    2: "Aprendiz de las Sombras",
    3: "Escriba Errante",
    4: "Guardián del Umbral",
    5: "Astrónomo Nocturno",
    6: "Tejedor de Hábitos",
    7: "Cronista del Vacío",
    8: "Arquitecto de Ritos",
    9: "Custodio del Grimoire",
    10: "Contemplador del Abismo",
    11: "Señor del Tiempo",
    12: "Oráculo Perpetuo",
    15: "Arconte de la Voluntad",
    20: "Ente del Éter Puro",
}


def title_for_level(level: int) -> str:
    """Return the highest title whose threshold <= level."""
    best = LEVEL_TITLES[1]
    for lvl in sorted(LEVEL_TITLES):
        if lvl <= level:
            best = LEVEL_TITLES[lvl]
    return best


STREAK_BONUS = {  # multiplicador de XP según racha
    7: 1.10,
    14: 1.20,
    30: 1.35,
    60: 1.50,
    100: 1.75,
}


def streak_multiplier(streak: int) -> float:
    mult = 1.0
    for threshold, value in sorted(STREAK_BONUS.items()):
        if streak >= threshold:
            mult = value
    return mult


BASE_XP = {
    "pomodoro_session": 15,
    "diary_entry": 5,
    "weekly_review": 30,
    "daily_checkin": 5,
    # El erario es un goteo, no un grifo. Anotar paga como el diario o el
    # check-in —el acto, una vez al día— y no como un hábito: si asentar pagara
    # lo mismo que cumplir un rito, la mejor forma de subir de nivel sería
    # apuntar cafés, y el nivel dejaría de medir constancia.
    "ledger_day": 5,
    # El cierre paga como la revisión semanal: es el momento en que de verdad
    # cambia la conducta, y es lo que dice toda la literatura del tema.
    "ledger_month_close": 30,
    # PLANO, no proporcional al monto. Proporcional significaría que tener más
    # dinero da más XP, y el nivel dejaría de medir constancia para medir renta.
    "relic_achieved": 50,
}


HABIT_CATEGORIES = ["Físico", "Académico", "Idioma", "Proyecto", "TCG", "Otro"]

# Seeded into the habit_categories catalog on first run (name, color).
# Users can add their own and delete any that no habit is using.
HABIT_CATEGORY_DEFAULTS = [
    ("Físico", "#6a9b7f"),
    ("Académico", "#9b7fc4"),
    ("Idioma", "#7f8fc4"),
    ("Proyecto", "#c47f9b"),
    ("TCG", "#c4a87f"),
    ("Otro", "#8a7a9c"),
]
PROJECT_CATEGORIES = ["Académico", "Personal", "TCG", "Trabajo"]


# tiers, from least to most prestigious (frontend colors them)
ACHIEVEMENT_TIERS = ["common", "rare", "epic", "legendary"]

# (key, name, description, tabler icon name, tier)
PREDEFINED_ACHIEVEMENTS = [
    ("first_blood", "Primera sangre", "Completa tu primer hábito.", "droplet", "common"),
    ("iron_constancy", "Constancia de hierro", "Mantén una racha de 7 días en cualquier hábito.", "flame", "common"),
    ("iron_month", "Mes de hierro", "Mantén una racha de 30 días en cualquier hábito.", "calendar-stats", "rare"),
    ("streak_60", "Voluntad inquebrantable", "Mantén una racha de 60 días.", "flame", "epic"),
    ("streak_centurion", "Llama eterna", "Mantén una racha de 100 días.", "torch", "legendary"),
    ("focus_centurion", "Centurión del foco", "Completa 100 sesiones Pomodoro.", "swords", "rare"),
    ("focus_legend", "Leyenda del foco", "Completa 250 sesiones Pomodoro.", "sword", "legendary"),
    ("ascension", "Ascenso", "Alcanza el nivel 5.", "stairs-up", "common"),
    ("contemplator", "El contemplador", "Alcanza el nivel 10.", "eye", "rare"),
    ("archon", "Arconte de la voluntad", "Alcanza el nivel 15.", "crown", "epic"),
    ("ether_being", "Ente del éter", "Alcanza el nivel 20.", "sparkles", "legendary"),
    ("archivist", "Archivista", "Escribe 30 entradas de diario.", "book", "common"),
    ("diary_century", "Cronista perpetuo", "Escribe 100 entradas de diario.", "books", "epic"),
    ("task_centurion", "Verdugo de tareas", "Completa 100 tareas.", "checkbox", "epic"),
    ("total_discipline", "Disciplina total", "Completa todos los hábitos del día durante 7 días seguidos.", "shield-check", "rare"),
    ("project_master", "Proyectista", "Cierra un proyecto completo.", "checklist", "common"),
    ("introspection", "Introspección", "Registra check-in de energía 14 días seguidos.", "mood-smile", "rare"),
    ("great_review", "Gran revisión", "Completa 4 revisiones semanales.", "notebook", "common"),
    ("polymath", "Polímata", "Ten hábitos activos en al menos 4 categorías distintas.", "atom", "rare"),
    ("quest_devotee", "Buscador de designios", "Reclama 10 misiones.", "target-arrow", "rare"),
    # Erario. Todos sobre la práctica de llevar el libro, ninguno sobre cuánto
    # dinero hay: un logro por tener saldo premiaría la suerte, no la constancia.
    ("first_entry", "Primer asiento", "Anota tu primer movimiento en el erario.", "feather", "common"),
    ("ledger_30", "Escriba del erario", "Anota algo en 30 días distintos.", "receipt", "common"),
    ("ledger_180", "Tenedor de libros", "Anota algo en 180 días distintos.", "books", "epic"),
    ("closed_books", "Cuentas cuadradas", "Cierra 3 meses del erario.", "scale", "rare"),
    ("full_ledger", "Nada sin partida", "Cierra un mes sin asientos sin clasificar.", "tags", "epic"),
    ("first_relic", "Primera reliquia", "Alcanza una meta de ahorro.", "diamond", "rare"),
    ("relic_hoard", "Tesoro", "Alcanza tres metas de ahorro.", "diamond", "legendary"),
]


# Quest templates seeded each period. metric is computed live in the router.
# (template_key, scope, metric, target, title, icon, xp_reward)
QUEST_TEMPLATES = [
    # daily
    ("daily_habits_3", "daily", "habits_completed", 3, "Triple rito del día", "checks", 25),
    ("daily_focus_50", "daily", "focus_minutes", 50, "50 minutos de foco", "clock-bolt", 25),
    ("daily_task_2", "daily", "tasks_completed", 2, "Despacha 2 tareas", "checkbox", 20),
    # weekly
    ("weekly_focus_120", "weekly", "focus_minutes", 120, "2 horas de foco", "clock-hour-4", 60),
    ("weekly_habits_15", "weekly", "habits_completed", 15, "15 hábitos en la semana", "flame", 60),
    ("weekly_diary_3", "weekly", "diary_entries", 3, "3 entradas de diario", "book", 50),
    # Erario: dos, y sobre el acto de anotar. La evidencia dice que los «retos»
    # son el elemento más flojo de la gamificación financiera, así que llenar el
    # tablero de misiones de dinero sería puro ruido.
    ("daily_ledger", "daily", "ledger_entries", 1, "Asienta el día", "feather", 15),
    ("weekly_ledger_5", "weekly", "ledger_days", 5, "Cinco días de cuentas", "receipt", 50),
]

MAX_LIVES = 3
STREAK_BREAK_XP_PENALTY = 15


# ---------------------------------------------------------------------------
# ERARIO
# ---------------------------------------------------------------------------
# Exponente de las unidades menores. NO es la tabla de ISO 4217: el peso
# colombiano declara 2 decimales y en la práctica nadie usa centavos, así que
# aquí vale 0 y un asiento de $18.000 se guarda como 18000, no como 1800000.
# Es la autoridad para guardar Y para mostrar; utils.ts lleva el espejo.
# Cambiar el exponente de una moneda ya usada reinterpreta lo guardado.
MONEY_DECIMALS = {
    "COP": 0, "CLP": 0, "PYG": 0, "ISK": 0, "JPY": 0, "KRW": 0, "VND": 0,
}
DEFAULT_CURRENCY = "COP"


def money_decimals(currency: str) -> int:
    return MONEY_DECIMALS.get((currency or "").upper(), 2)


# Partidas sembradas en el primer arranque (nombre, tipo, color, icono tabler).
# Los colores salen de --gr-cat-* : paleta de datos, fría y saturada. Ninguno es
# dorado: el oro no marca dinero, marca lo que se ganó.
LEDGER_CATEGORY_DEFAULTS = [
    ("Alimentación", "expense", "#5aa885", "tools-kitchen-2"),
    ("Transporte", "expense", "#6f93e0", "bus"),
    ("Universidad", "expense", "#a98bf0", "school"),
    ("Salud", "expense", "#63a9c4", "heartbeat"),
    ("Ocio", "expense", "#cf7ba6", "movie"),
    ("Hogar", "expense", "#b8807f", "home"),
    ("Otros gastos", "expense", "#9a90b5", "dots"),
    ("Ingreso", "income", "#5aa885", "coins"),
]

