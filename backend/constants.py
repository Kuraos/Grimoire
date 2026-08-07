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
]

MAX_LIVES = 3
STREAK_BREAK_XP_PENALTY = 15

