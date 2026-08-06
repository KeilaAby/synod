---
trigger: always_on
---

Après chaque modification : 

demande ma permission avant de pusher vers GitHub

Avant de pusher, met à jour les element necessaires pour la machine distante puis pusher avec les fichiers du code qui doivent être pusher :
- SESSION_HISTORY, 
- dernier fichier ..._resumes-moi; 
-CLAUDE.md
- .agents/plan/plan.md (supprimer les lignes des tâches terminées, ajouter les nouvelles)
