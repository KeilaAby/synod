Nous allons developper une application web d'eglise comme suit : 

# STRUCTURE DES DONNEES
1. La structure de l'eglise est la suivante : 

- Un régional : coposé de plusieurs "Ditrict"
- Un District : composée de plusieurs "Paroisse"
- Une paroisse : composée de plusieurs "Eglise"
- Une Eglise : composée de plusieurs "Cellule de prière"
- Une cellule composé de plusieurs "Croyant"

Chaque entité a un nom et un code à 3 lettres minimum.

2. Un croyant à les propriétés suivantes

- photo de profil (facultatif)
- Nom
- Prenom
- statut marital (facultatif)
- email (facultatif)
- téléphone (facultatif)
- sexe
- date de naissance
- date de bapteme
- adresse
- eglise d'appartenance
- cellule d'appartenance (facultatif)
- grade*
- nationalité**

3. * Une grade doit être une table à part entière pour mettre à disposition différente grade selectionnable lors de la création d'un Croyant (Diacre, Pasteur, Croyant)
4. ** Une nationalité doit être une table à part entière pour mettre à disposition différente nationalité selectionnable lors de la création d'un Croyant (Ex: Béninoise, Française, Malienne ...)

5. Chaque entité (Cellule - Eglise - Paroisse - District - Régional) doit avoir un Bureau composé de croyants. Par exemple un Bureau District "Avaradrano" est composé des croyants ayant les fonction ci-après :

- un President
- un Secrétaire
- un Trésorier
- un Directeur des finances
- un Directeur des communications
- un Directeur des oeuvres
- etc..

En effet, il est préferable de l'isoler dans une tablea "Fonction" à part entière pour eviter la redondance des données et pour mieux filtrer les statistiques.
Il faut permettre de créer et gérer un Bureau pour chaque entité (Cellule - Eglise - Paroisse - District - Régional)

6. Un croyant peut être transféré d'une cellule à une autre, d'une eglise à une autre, d'une paroisse à une autre, d'un district à un autre, d'un régional à un autre. Et un croyant n'est pas forcement un membre de bureau et n'a pas forcement de "Fonction". Mais si un croyant est un membre de bureau, il doit etre obligatoirement un croyant.

7. Chaque entité doit avoir son propré "Finance" tels que ci-après : 

- Dimes
- Quête
- Autres... 

En effet, il est préferable de l'isoler dans une tablea "Finance" à part entière pour eviter la redondance des données et pour mieux filtrer les statistiques.
Il faut permettre de créer et gérer les Finances pour chaque entité (Cellule - Eglise - Paroisse - District - Régional).

# FONCTIONS DE L'APPLICATION

1. L'application doit permettre à l'Administrateur du Siège (SuperAdmin) de gérer les différentes entités (Cellule - Eglise - Paroisse - District - Régional) et les Croyants. De voir dans un Tableau de Bord les Statristiques (Nombre de croyants, Nombre de cellules, Nombre d'eglises, Nombre de paroisses, Nombre de districts, Nombre de régionaux, Nombre de femmes, Nombre d'hommes, Nombre de membres de bureau, Nombre de membres de finances...)
2. Une Entite sauf les cellules doit pourvoir avoir accès au pletforme dans la limité des habilitations mises à dispoitions par l'Administrateur du Siège (SuperAdmin) (Création de croyant, Gestion de Bureau, Gestion Finance)
3. Une Entité peut également saisir les informations sur les nouveaux baptisés et les données seront visbles par le SUPERADMIN dans son tableau de bord.
4. Les Entités doit également avoir un tableau de bord comme le SuperAdmin mais lmité aux données de son périmètre
5. L'affichage du Tableau de bord doit être configurable et flexible tant pour le SuperAdmin et les Entités. Par exemple, le SuperAdmin peut choisir de n'afficher que le nombre de femmes et le nombre de croyants, tandis que le District peut choisir d'afficher le nombre de croyants, le nombre de femmes et le nombre de membres de bureau. Ainsi de suite

# PHILOSOPHIE

1. L'application doit être flexible dans son ensemble.
2. L'application doit être simple à utiliser.
3. L'application doit être rapide à utiliser.
4. L'application doit être sécurisée.
5. Pour la répresnetation des hierachie des Entités, Bureau, utiliser React Flow
