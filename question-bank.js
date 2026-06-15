/* =========================================================================
   GENERATEUR DE QUESTIONS "KAMI" (agent IA local, hors-ligne, gratuit)
   - Banque de questions par theme et difficulte.
   - Utilise par les modes VERSUS (1v1 IA) et SOLO ENTRAINEMENT.
   - genererQuestions(theme, difficulte, n) -> tableau de questions normalisees
     { type:'qcm', text, options:[...], correct:[idx], time }
   ========================================================================= */

// time par defaut selon difficulte
const TIME_BY_DIFF = { facile: 20, moyen: 15, difficile: 12 };

// Banque : chaque entree = { q, options:[...], a:indexBonneReponse, diff:['facile'...] }
const BANK = {
  culture_generale: [
    { q:"Quelle est la capitale de la France ?", o:["Paris","Lyon","Marseille","Nice"], a:0, d:["facile"] },
    { q:"Combien de continents y a-t-il sur Terre ?", o:["5","6","7","8"], a:2, d:["facile"] },
    { q:"Quel est l'astre au centre du systeme solaire ?", o:["La Lune","Le Soleil","Mars","Venus"], a:1, d:["facile"] },
    { q:"Combien de cotes a un hexagone ?", o:["5","6","7","8"], a:1, d:["facile"] },
    { q:"Quelle planete est surnommee la planete rouge ?", o:["Venus","Jupiter","Mars","Saturne"], a:2, d:["facile","moyen"] },
    { q:"Qui a peint la Joconde ?", o:["Picasso","Van Gogh","Leonard de Vinci","Monet"], a:2, d:["moyen"] },
    { q:"Quel est le plus grand ocean du monde ?", o:["Atlantique","Indien","Arctique","Pacifique"], a:3, d:["moyen"] },
    { q:"En quelle annee a eu lieu la Revolution francaise ?", o:["1789","1815","1492","1914"], a:0, d:["moyen"] },
    { q:"Quel organe pompe le sang dans le corps ?", o:["Le foie","Le coeur","Les poumons","Le cerveau"], a:1, d:["facile"] },
    { q:"Quelle est la monnaie du Japon ?", o:["Le yuan","Le won","Le yen","Le dollar"], a:2, d:["moyen"] },
    { q:"Qui a ecrit 'Les Miserables' ?", o:["Zola","Victor Hugo","Balzac","Flaubert"], a:1, d:["moyen","difficile"] },
    { q:"Quel gaz les plantes absorbent-elles pour la photosynthese ?", o:["Oxygene","Azote","Dioxyde de carbone","Hydrogene"], a:2, d:["moyen"] },
    { q:"Quel est l'element chimique de symbole 'Au' ?", o:["Argent","Or","Aluminium","Cuivre"], a:1, d:["difficile"] },
    { q:"Combien de joueurs dans une equipe de football sur le terrain ?", o:["9","10","11","12"], a:2, d:["facile"] },
    { q:"Quel pays a la forme d'une botte ?", o:["Espagne","Grece","Italie","Portugal"], a:2, d:["facile"] },
    { q:"Quelle est la vitesse de la lumiere (approx.) ?", o:["300 000 km/s","150 000 km/s","1 000 km/s","3 000 km/s"], a:0, d:["difficile"] },
    { q:"Qui a developpe la theorie de la relativite ?", o:["Newton","Einstein","Galilee","Tesla"], a:1, d:["moyen","difficile"] },
    { q:"Quel est le plus long fleuve du monde ?", o:["Amazone","Nil","Yangtsé","Mississippi"], a:1, d:["difficile"] },
    { q:"Combien de minutes dans une heure ?", o:["30","60","90","100"], a:1, d:["facile"] },
    { q:"Quelle est la langue la plus parlee au monde ?", o:["Anglais","Espagnol","Mandarin","Hindi"], a:2, d:["difficile"] }
  ],
  japon: [
    { q:"Quelle est la capitale du Japon ?", o:["Osaka","Kyoto","Tokyo","Nagoya"], a:2, d:["facile"] },
    { q:"Comment appelle-t-on le masque de renard japonais ?", o:["Kitsune","Tanuki","Oni","Tengu"], a:0, d:["facile","moyen"] },
    { q:"Que signifie 'Kami' (神) ?", o:["Guerrier","Esprit / divinite","Montagne","Riviere"], a:1, d:["facile"] },
    { q:"Quel est le plat japonais a base de riz vinaigre et poisson ?", o:["Ramen","Sushi","Tempura","Udon"], a:1, d:["facile"] },
    { q:"Comment s'appelle l'art du pliage de papier ?", o:["Ikebana","Origami","Kintsugi","Bonsai"], a:1, d:["facile"] },
    { q:"Quelle est la plus haute montagne du Japon ?", o:["Mont Aso","Mont Fuji","Mont Koya","Mont Tate"], a:1, d:["moyen"] },
    { q:"Comment appelle-t-on un guerrier japonais traditionnel ?", o:["Ninja","Samurai","Shogun","Ronin"], a:1, d:["facile"] },
    { q:"Quel portail rouge marque l'entree des sanctuaires shinto ?", o:["Torii","Pagode","Dojo","Tatami"], a:0, d:["moyen"] },
    { q:"Quelle ville fut l'ancienne capitale imperiale ?", o:["Tokyo","Kyoto","Hiroshima","Sapporo"], a:1, d:["moyen","difficile"] },
    { q:"Comment dit-on 'merci' en japonais ?", o:["Sayonara","Konnichiwa","Arigato","Sumimasen"], a:2, d:["facile"] },
    { q:"Quel animal le 'Tanuki' represente-t-il ?", o:["Le chien viverrin","Le renard","Le chat","Le singe"], a:0, d:["difficile"] },
    { q:"Quel est le nom de l'ecriture syllabique japonaise utilisee pour les mots etrangers ?", o:["Hiragana","Kanji","Katakana","Romaji"], a:2, d:["difficile"] },
    { q:"Comment s'appelle la ceremonie du the ?", o:["Chanoyu","Kabuki","Sumo","Geisha"], a:0, d:["difficile"] },
    { q:"Quel demon japonais a des cornes et une peau rouge ?", o:["Oni","Kitsune","Kappa","Yokai"], a:0, d:["moyen"] },
    { q:"Quelle fleur est emblematique du Japon au printemps ?", o:["La rose","Le cerisier (sakura)","La tulipe","Le lotus"], a:1, d:["facile"] },
    { q:"Quel sport de lutte est traditionnel au Japon ?", o:["Judo","Sumo","Karate","Aikido"], a:1, d:["moyen"] },
    { q:"Comment appelle-t-on le poignard court porte par les samurai ?", o:["Katana","Wakizashi","Tanto","Naginata"], a:2, d:["difficile"] },
    { q:"Quelle est la monnaie japonaise ?", o:["Won","Yen","Yuan","Baht"], a:1, d:["facile"] },
    { q:"Quel esprit de l'eau verdatre vit dans les rivieres ?", o:["Kappa","Tengu","Oni","Kitsune"], a:0, d:["difficile"] },
    { q:"Comment dit-on 'bonjour' (journee) en japonais ?", o:["Konbanwa","Ohayo","Konnichiwa","Oyasumi"], a:2, d:["moyen"] }
  ],
  sciences: [
    { q:"Quel est le symbole chimique de l'eau ?", o:["O2","H2O","CO2","NaCl"], a:1, d:["facile"] },
    { q:"Combien de planetes dans le systeme solaire ?", o:["7","8","9","10"], a:1, d:["facile"] },
    { q:"Quelle force nous attire vers le sol ?", o:["Magnetisme","Gravite","Friction","Tension"], a:1, d:["facile"] },
    { q:"Quel organe filtre le sang ?", o:["Le coeur","Les reins","L'estomac","La rate"], a:1, d:["moyen"] },
    { q:"Quelle est l'unite de mesure du courant electrique ?", o:["Volt","Watt","Ampere","Ohm"], a:2, d:["moyen"] },
    { q:"De quoi est principalement compose le Soleil ?", o:["Fer","Hydrogene et helium","Oxygene","Carbone"], a:1, d:["moyen"] },
    { q:"Quel scientifique a formule les lois du mouvement ?", o:["Einstein","Newton","Darwin","Bohr"], a:1, d:["moyen"] },
    { q:"Combien de chromosomes possede l'humain ?", o:["23","46","48","44"], a:1, d:["difficile"] },
    { q:"Quel est l'etat de l'eau a 0°C ?", o:["Gazeux","Liquide","Solide","Plasma"], a:2, d:["facile"] },
    { q:"Quelle particule a une charge negative ?", o:["Proton","Neutron","Electron","Photon"], a:2, d:["moyen"] },
    { q:"Quel gaz respirons-nous principalement pour vivre ?", o:["Azote","Oxygene","Helium","Hydrogene"], a:1, d:["facile"] },
    { q:"Quelle est la plus petite unite du vivant ?", o:["L'atome","La cellule","La molecule","Le tissu"], a:1, d:["moyen"] },
    { q:"Quel metal est liquide a temperature ambiante ?", o:["Fer","Mercure","Plomb","Etain"], a:1, d:["difficile"] },
    { q:"Quelle vitamine produit-on grace au soleil ?", o:["Vitamine A","Vitamine C","Vitamine D","Vitamine K"], a:2, d:["moyen"] },
    { q:"Quel est le plus grand organe du corps humain ?", o:["Le foie","La peau","Les poumons","L'intestin"], a:1, d:["difficile"] },
    { q:"Quelle planete est la plus grande ?", o:["Terre","Saturne","Jupiter","Neptune"], a:2, d:["moyen"] },
    { q:"Quel scientifique a propose la theorie de l'evolution ?", o:["Mendel","Darwin","Pasteur","Lamarck"], a:1, d:["moyen","difficile"] },
    { q:"Combien de pattes possede un insecte ?", o:["4","6","8","10"], a:1, d:["facile"] },
    { q:"Quel est le centre de controle de la cellule ?", o:["Mitochondrie","Noyau","Membrane","Ribosome"], a:1, d:["difficile"] },
    { q:"Quelle energie est produite par les panneaux solaires ?", o:["Thermique","Electrique","Nucleaire","Eolienne"], a:1, d:["facile"] }
  ],
  histoire: [
    { q:"Qui etait le premier empereur des Francais ?", o:["Louis XIV","Napoleon Bonaparte","Charlemagne","Henri IV"], a:1, d:["facile","moyen"] },
    { q:"En quelle annee a commence la Seconde Guerre mondiale ?", o:["1914","1939","1945","1929"], a:1, d:["moyen"] },
    { q:"Quelle civilisation a construit les pyramides de Gizeh ?", o:["Romaine","Grecque","Egyptienne","Maya"], a:2, d:["facile"] },
    { q:"Qui a decouvert l'Amerique en 1492 ?", o:["Magellan","Christophe Colomb","Vasco de Gama","Marco Polo"], a:1, d:["facile"] },
    { q:"Quel mur est tombe en 1989 ?", o:["Mur de Chine","Mur de Berlin","Mur des Lamentations","Mur d'Hadrien"], a:1, d:["moyen"] },
    { q:"Quelle reine d'Egypte est celebre pour sa beaute ?", o:["Nefertiti","Cleopatre","Hatchepsout","Isis"], a:1, d:["moyen"] },
    { q:"Qui a prononce 'Je pense donc je suis' ?", o:["Voltaire","Descartes","Rousseau","Kant"], a:1, d:["difficile"] },
    { q:"Quelle guerre opposa le Nord et le Sud des Etats-Unis ?", o:["Guerre d'independance","Guerre de Secession","Guerre froide","Guerre du Vietnam"], a:1, d:["moyen","difficile"] },
    { q:"Quel roi de France etait surnomme le Roi-Soleil ?", o:["Louis XIV","Louis XVI","Francois Ier","Henri IV"], a:0, d:["moyen"] },
    { q:"Quelle ville antique fut detruite par le Vesuve ?", o:["Rome","Athenes","Pompei","Carthage"], a:2, d:["difficile"] },
    { q:"En quelle annee l'homme a-t-il marche sur la Lune ?", o:["1959","1969","1979","1989"], a:1, d:["moyen"] },
    { q:"Quel explorateur a fait le premier tour du monde en bateau ?", o:["Colomb","Magellan","Cook","Drake"], a:1, d:["difficile"] },
    { q:"Quelle dynastie a regne longtemps sur la Chine imperiale ?", o:["Ming","Tudor","Bourbon","Habsbourg"], a:0, d:["difficile"] },
    { q:"Qui etait Jeanne d'Arc ?", o:["Une reine","Une heroine francaise","Une peintre","Une scientifique"], a:1, d:["facile","moyen"] },
    { q:"Quel empire etait dirige par Jules Cesar ?", o:["Grec","Romain","Perse","Ottoman"], a:1, d:["facile"] },
    { q:"Quelle revolution a eu lieu en 1789 ?", o:["Industrielle","Francaise","Russe","Americaine"], a:1, d:["facile"] },
    { q:"Quel pharaon a un celebre masque funeraire en or ?", o:["Ramses","Toutankhamon","Kheops","Akhenaton"], a:1, d:["moyen"] },
    { q:"Quelle periode suit le Moyen Age ?", o:["Antiquite","Renaissance","Prehistoire","Industrielle"], a:1, d:["moyen"] },
    { q:"Quel conflit a oppose l'URSS et les USA sans guerre directe ?", o:["Guerre froide","Guerre des Boers","Guerre de Cent Ans","Guerre de Crimee"], a:0, d:["moyen"] },
    { q:"Qui a unifie l'Italie au 19e siecle ?", o:["Garibaldi","Mussolini","Cavour","Napoleon III"], a:0, d:["difficile"] }
  ],
  sport: [
    { q:"Combien de joueurs dans une equipe de basketball sur le terrain ?", o:["5","6","7","11"], a:0, d:["facile"] },
    { q:"Dans quel sport marque-t-on un 'touchdown' ?", o:["Rugby","Football americain","Hockey","Baseball"], a:1, d:["moyen"] },
    { q:"Tous les combien d'annees ont lieu les Jeux Olympiques d'ete ?", o:["2 ans","3 ans","4 ans","5 ans"], a:2, d:["facile"] },
    { q:"Quel pays a invente le judo ?", o:["Chine","Coree","Japon","Thailande"], a:2, d:["moyen"] },
    { q:"Combien de points vaut un essai au rugby (a XV) ?", o:["3","5","6","7"], a:1, d:["difficile"] },
    { q:"Dans quel sport utilise-t-on un 'birdie' ?", o:["Tennis","Golf","Badminton","Squash"], a:1, d:["moyen"] },
    { q:"Quel est le sport le plus populaire au monde ?", o:["Basketball","Football","Cricket","Tennis"], a:1, d:["facile"] },
    { q:"Combien de sets faut-il gagner pour remporter un match de tennis (homme, Grand Chelem) ?", o:["2","3","4","5"], a:1, d:["difficile"] },
    { q:"Quel athlete est surnomme 'la Foudre' (Lightning) ?", o:["Usain Bolt","Carl Lewis","Mo Farah","Asafa Powell"], a:0, d:["moyen"] },
    { q:"Dans quel sport y a-t-il un 'home run' ?", o:["Cricket","Baseball","Hockey","Golf"], a:1, d:["moyen"] },
    { q:"Combien de trous dans un parcours de golf classique ?", o:["9","12","18","24"], a:2, d:["moyen"] },
    { q:"Quel pays a gagne le plus de Coupes du monde de football ?", o:["Allemagne","Bresil","Italie","Argentine"], a:1, d:["difficile"] },
    { q:"Quel sport se pratique sur un tatami ?", o:["Boxe","Judo","Natation","Cyclisme"], a:1, d:["facile"] },
    { q:"Combien de joueurs dans une equipe de volley-ball sur le terrain ?", o:["5","6","7","8"], a:1, d:["moyen"] },
    { q:"Quel est le but au football ?", o:["Marquer des paniers","Marquer des buts","Faire des tries","Servir des aces"], a:1, d:["facile"] },
    { q:"Dans quelle ville se trouve le stade Maracana ?", o:["Buenos Aires","Rio de Janeiro","Sao Paulo","Lima"], a:1, d:["difficile"] },
    { q:"Quel sport utilise une rondelle (palet) ?", o:["Hockey sur glace","Curling","Patinage","Ski"], a:0, d:["moyen"] },
    { q:"Combien de rounds maximum dans un combat de boxe pro (championnat) ?", o:["10","12","15","20"], a:1, d:["difficile"] },
    { q:"Quel pays organise le Tour de France ?", o:["Italie","Espagne","France","Belgique"], a:2, d:["facile"] },
    { q:"Quel sport est associe a Roland-Garros ?", o:["Golf","Tennis","Cyclisme","Football"], a:1, d:["facile"] }
  ],
  cinema: [
    { q:"Qui a realise le film 'Titanic' ?", o:["Steven Spielberg","James Cameron","Christopher Nolan","Ridley Scott"], a:1, d:["moyen"] },
    { q:"Dans quel film entend-on 'Que la Force soit avec toi' ?", o:["Star Trek","Star Wars","Avatar","Matrix"], a:1, d:["facile"] },
    { q:"Quel acteur incarne Iron Man ?", o:["Chris Evans","Robert Downey Jr.","Chris Hemsworth","Mark Ruffalo"], a:1, d:["moyen"] },
    { q:"Quel studio a cree 'Le Roi Lion' ?", o:["Pixar","DreamWorks","Disney","Universal"], a:2, d:["facile"] },
    { q:"Quel film met en scene un requin tueur ?", o:["Les Dents de la mer","Piranha","Deep Blue Sea","Orca"], a:0, d:["moyen"] },
    { q:"Qui joue Jack dans 'Titanic' ?", o:["Brad Pitt","Leonardo DiCaprio","Tom Cruise","Johnny Depp"], a:1, d:["facile"] },
    { q:"Dans quel film y a-t-il une pilule rouge et une pilule bleue ?", o:["Inception","Matrix","Tron","Blade Runner"], a:1, d:["moyen"] },
    { q:"Quel personnage dit 'Je reviendrai' (I'll be back) ?", o:["Rambo","Terminator","RoboCop","John Wick"], a:1, d:["moyen"] },
    { q:"Quel film d'animation parle d'un poisson-clown perdu ?", o:["Nemo","Le Monde de Nemo","Shark Tale","Bubulle"], a:1, d:["facile"] },
    { q:"Qui a realise 'Inception' et 'Interstellar' ?", o:["Tarantino","Nolan","Fincher","Villeneuve"], a:1, d:["difficile"] },
    { q:"Quelle saga se passe a Poudlard ?", o:["Le Seigneur des Anneaux","Harry Potter","Narnia","Percy Jackson"], a:1, d:["facile"] },
    { q:"Quel film a remporte l'Oscar du meilleur film en 2020 (coreen) ?", o:["1917","Parasite","Joker","Roma"], a:1, d:["difficile"] },
    { q:"Quel super-heros est aussi Bruce Wayne ?", o:["Superman","Batman","Spider-Man","Flash"], a:1, d:["facile"] },
    { q:"Dans 'Le Seigneur des Anneaux', que doit-on detruire ?", o:["Une epee","Un anneau","Une couronne","Un livre"], a:1, d:["facile"] },
    { q:"Quel acteur joue Jack Sparrow ?", o:["Orlando Bloom","Johnny Depp","Russell Crowe","Colin Farrell"], a:1, d:["moyen"] },
    { q:"Quel film de 1994 suit Forrest sur un banc ?", o:["Forrest Gump","Big","Rain Man","Cast Away"], a:0, d:["moyen"] },
    { q:"Quelle ville est attaquee par King Kong (version classique) ?", o:["Londres","New York","Tokyo","Paris"], a:1, d:["difficile"] },
    { q:"Quel realisateur est connu pour 'Pulp Fiction' ?", o:["Scorsese","Tarantino","Coppola","Spielberg"], a:1, d:["difficile"] },
    { q:"Quel film Pixar parle de jouets vivants ?", o:["Cars","Toy Story","Up","Coco"], a:1, d:["facile"] },
    { q:"Quel acteur incarne Neo dans Matrix ?", o:["Keanu Reeves","Will Smith","Tom Hardy","Hugh Jackman"], a:0, d:["moyen"] }
  ],
  mangas_animes: [
    { q:"Comment s'appelle le heros de 'Naruto' ?", o:["Sasuke","Naruto Uzumaki","Kakashi","Itachi"], a:1, d:["facile"] },
    { q:"Quel fruit donne ses pouvoirs a Luffy dans 'One Piece' ?", o:["Mera Mera","Gomu Gomu","Hito Hito","Ope Ope"], a:1, d:["facile","moyen"] },
    { q:"Dans 'Dragon Ball', quelle transformation rend les cheveux dores ?", o:["Kaioken","Super Saiyan","Ultra Instinct","Fusion"], a:1, d:["facile"] },
    { q:"Quel est le but principal de Luffy dans 'One Piece' ?", o:["Devenir Hokage","Devenir Roi des Pirates","Tuer les demons","Sauver sa soeur"], a:1, d:["facile"] },
    { q:"Dans 'Attack on Titan', comment appelle-t-on les geants ?", o:["Hollows","Titans","Akumas","Espadas"], a:1, d:["facile"] },
    { q:"Quel est le carnet de la mort dans 'Death Note' ?", o:["Death Book","Death Note","Kira List","Shinigami Pad"], a:1, d:["facile"] },
    { q:"Comment s'appelle la soeur de Tanjiro devenue demon dans 'Demon Slayer' ?", o:["Nezuko","Shinobu","Mitsuri","Kanao"], a:0, d:["facile","moyen"] },
    { q:"Dans 'My Hero Academia', comment appelle-t-on les pouvoirs ?", o:["Quirks (Alters)","Nen","Chakra","Haki"], a:0, d:["moyen"] },
    { q:"Quel personnage de 'Dragon Ball' est un Saiyan eleve sur Terre ?", o:["Vegeta","Goku","Broly","Raditz"], a:1, d:["facile"] },
    { q:"Dans 'Fullmetal Alchemist', que perd Edward en tentant de ressusciter sa mere ?", o:["La vue","Un bras et une jambe","La memoire","Sa voix"], a:1, d:["moyen","difficile"] },
    { q:"Quel est le nom du Death God qui suit Light dans 'Death Note' ?", o:["Rem","Ryuk","Sidoh","Gelus"], a:1, d:["moyen"] },
    { q:"Dans 'Naruto', quel village est celui de Naruto ?", o:["Suna","Konoha","Kiri","Iwa"], a:1, d:["facile","moyen"] },
    { q:"Comment s'appelle le concept d'energie spirituelle dans 'Hunter x Hunter' ?", o:["Chakra","Nen","Reiatsu","Ki"], a:1, d:["difficile"] },
    { q:"Quel anime suit Eren Yeager ?", o:["Tokyo Ghoul","Attack on Titan","Bleach","Berserk"], a:1, d:["facile"] },
    { q:"Dans 'One Piece', quel personnage est un sabreur a trois sabres ?", o:["Sanji","Zoro","Usopp","Brook"], a:1, d:["moyen"] },
    { q:"Quel studio a produit 'Demon Slayer' (l'anime) ?", o:["Studio Ghibli","Ufotable","Madhouse","Bones"], a:1, d:["difficile"] },
    { q:"Dans 'Bleach', comment appelle-t-on les esprits que Ichigo combat ?", o:["Titans","Hollows","Demons","Akatsuki"], a:1, d:["moyen"] },
    { q:"Quel film du Studio Ghibli met en scene Chihiro dans un monde d'esprits ?", o:["Mon voisin Totoro","Le Voyage de Chihiro","Princesse Mononoke","Ponyo"], a:1, d:["moyen"] },
    { q:"Dans 'Jujutsu Kaisen', que mange Yuji pour obtenir des pouvoirs ?", o:["Un fruit du demon","Un doigt de Sukuna","Une pilule","Un cristal"], a:1, d:["moyen","difficile"] },
    { q:"Comment s'appelle le robot geant pilote par Shinji dans 'Evangelion' ?", o:["Gundam","EVA-01","Voltron","Mazinger"], a:1, d:["difficile"] },
    { q:"Dans 'Dragon Ball Z', qui detruit la planete Namek ?", o:["Cell","Freezer (Frieza)","Boo","Vegeta"], a:1, d:["moyen"] },
    { q:"Quel personnage porte un masque et est le rival de Naruto ?", o:["Gaara","Sasuke","Rock Lee","Neji"], a:1, d:["facile"] },
    { q:"Dans 'One Punch Man', en combien de coups Saitama bat-il ses ennemis ?", o:["Trois","Un seul","Dix","Cent"], a:1, d:["facile"] },
    { q:"Quel anime se deroule dans l'univers des pirates avec Monkey D. Luffy ?", o:["Fairy Tail","One Piece","Black Clover","Toriko"], a:1, d:["facile"] },
    { q:"Dans 'Sailor Moon', quel astre represente l'heroine ?", o:["Le Soleil","La Lune","Mars","Venus"], a:1, d:["moyen"] },
    { q:"Quel est le veritable nom de Kira dans 'Death Note' ?", o:["L","Light Yagami","Near","Mello"], a:1, d:["facile"] },
    { q:"Dans 'Demon Slayer', quel est le pouvoir de respiration de Tanjiro au debut ?", o:["Respiration du feu","Respiration de l'eau","Respiration du tonnerre","Respiration de la bete"], a:1, d:["moyen","difficile"] },
    { q:"Quel mangaka a cree 'Dragon Ball' ?", o:["Eiichiro Oda","Akira Toriyama","Masashi Kishimoto","Tite Kubo"], a:1, d:["difficile"] },
    { q:"Dans 'Pokemon', quel est le Pokemon de depart electrique iconique ?", o:["Salameche","Pikachu","Bulbizarre","Carapuce"], a:1, d:["facile"] },
    { q:"Quel anime suit des chasseurs de demons a l'epoque Taisho ?", o:["Demon Slayer","Inuyasha","Bleach","Noragami"], a:0, d:["moyen"] }
  ],
  evenements_animes: [
    { q:"Dans 'Naruto', qui meurt en protegeant le village lors de l'attaque de Pain ?", o:["Jiraiya","Kakashi","Asuma","Neji"], a:0, d:["moyen","difficile"] },
    { q:"Quel evenement choc ouvre 'Attack on Titan' (episode 1) ?", o:["La chute du Mur Maria","La mort d'Eren","La trahison d'Annie","La bataille de Trost"], a:0, d:["moyen"] },
    { q:"Dans 'Dragon Ball Z', quel personnage se sacrifie en emportant Cell dans l'espace ?", o:["Goku","Vegeta","Gohan","Piccolo"], a:0, d:["moyen","difficile"] },
    { q:"Dans 'One Piece', quel evenement marque la guerre de Marineford ?", o:["La mort d'Ace","La mort de Shanks","La capture de Luffy","La fin de Barbe Blanche uniquement"], a:0, d:["difficile"] },
    { q:"Dans 'Demon Slayer', quel Pilier affronte Akaza dans l'arc du train ?", o:["Rengoku","Tengen","Giyu","Sanemi"], a:0, d:["moyen","difficile"] },
    { q:"Dans 'Death Note', comment L decouvre-t-il la zone de Kira au debut ?", o:["Une diffusion TV piege","Un piratage","Un indic","Une lettre"], a:0, d:["difficile"] },
    { q:"Dans 'Fullmetal Alchemist', quel jour tragique est appele 'la Promesse' ?", o:["Le Jour Promis","La Nuit des Homonculus","Le Sacrifice","L'Eclipse"], a:0, d:["difficile"] },
    { q:"Dans 'Naruto', quel combat final oppose Naruto a son meilleur ami ?", o:["Naruto vs Sasuke","Naruto vs Pain","Naruto vs Madara","Naruto vs Gaara"], a:0, d:["facile","moyen"] },
    { q:"Dans 'Attack on Titan', que decouvre-t-on dans le sous-sol du pere d'Eren ?", o:["La verite sur le monde et Marley","Un Titan endormi","Un tresor","Rien"], a:0, d:["difficile"] },
    { q:"Dans 'Jujutsu Kaisen', quel evenement majeur est 'l'Incident de Shibuya' ?", o:["Une attaque massive de fleaux","Un tournoi","Un mariage","Une eclipse"], a:0, d:["difficile"] },
    { q:"Dans 'Dragon Ball', qui realise la premiere transformation Super Saiyan de la serie ?", o:["Goku (contre Freezer)","Vegeta","Gohan","Trunks"], a:0, d:["moyen"] },
    { q:"Dans 'One Piece', combien de temps l'equipage s'entraine-t-il apres Marineford ?", o:["2 ans","6 mois","5 ans","1 an"], a:0, d:["moyen","difficile"] },
    { q:"Dans 'Tokyo Ghoul', comment Kaneki devient-il un demi-goule ?", o:["Une greffe d'organes","Une morsure","Une malediction","Un virus"], a:0, d:["moyen","difficile"] },
    { q:"Dans 'My Hero Academia', qui transmet le One For All a Deku ?", o:["All Might","Endeavor","Aizawa","Bakugo"], a:0, d:["facile","moyen"] },
    { q:"Dans 'Bleach', dans quel monde Ichigo va-t-il sauver Rukia ?", o:["La Soul Society","Hueco Mundo","Le Hokai","Karakura"], a:0, d:["moyen","difficile"] },
    { q:"Dans 'Code Geass', quel pouvoir possede Lelouch ?", o:["Le Geass","Le Nen","Le Sharingan","Le Stand"], a:0, d:["difficile"] },
    { q:"Dans 'Sword Art Online', que risquent les joueurs pieges dans le jeu ?", o:["La mort reelle","Perdre des points","Etre bannis","Rien"], a:0, d:["moyen"] },
    { q:"Dans 'Naruto Shippuden', quelle organisation chasse les Bijuu ?", o:["L'Akatsuki","L'Anbu","Les Sept Epeistes","Le Conseil"], a:0, d:["facile","moyen"] },
    { q:"Dans 'Demon Slayer', qui est le roi des demons ?", o:["Muzan Kibutsuji","Kokushibo","Akaza","Doma"], a:0, d:["moyen"] },
    { q:"Dans 'Hunter x Hunter', quel arc met en scene les Chimeres Ant (Fourmis-Chimeres) ?", o:["L'arc des Chimera Ants","L'arc Yorknew","L'arc de l'examen","l'arc des Phantom Troupe"], a:0, d:["difficile"] }
  ],
  jeux_video: [
    { q:"Quel plombier est la mascotte de Nintendo ?", o:["Luigi","Mario","Wario","Yoshi"], a:1, d:["facile"] },
    { q:"Dans quel jeu construit-on avec des blocs cubiques ?", o:["Roblox","Minecraft","Terraria","Fortnite"], a:1, d:["facile"] },
    { q:"Quel est le nom du heros de 'The Legend of Zelda' ?", o:["Zelda","Link","Ganon","Navi"], a:1, d:["moyen"] },
    { q:"Dans 'Pokemon', qui est le rival electrique jaune ?", o:["Pikachu","Raichu","Pichu","Voltali"], a:0, d:["facile"] },
    { q:"Quel battle royale a popularise les 100 joueurs et la construction ?", o:["PUBG","Fortnite","Apex","Warzone"], a:1, d:["facile"] },
    { q:"Quel jeu de combat met en scene Ryu et Ken ?", o:["Tekken","Street Fighter","Mortal Kombat","Smash Bros"], a:1, d:["moyen"] },
    { q:"Dans 'Sonic', de quelle couleur est le herisson ?", o:["Rouge","Bleu","Vert","Jaune"], a:1, d:["facile"] },
    { q:"Quel studio a cree 'The Witcher 3' ?", o:["Bethesda","CD Projekt Red","Ubisoft","Rockstar"], a:1, d:["difficile"] },
    { q:"Quel jeu a pour heros Master Chief ?", o:["Halo","Doom","Destiny","Gears of War"], a:0, d:["moyen"] },
    { q:"Dans 'Among Us', comment appelle-t-on le traitre ?", o:["Le Killer","L'Imposteur","Le Saboteur","Le Fantome"], a:1, d:["facile"] },
    { q:"Quel jeu de Rockstar se passe a Los Santos ?", o:["Red Dead","GTA V","Mafia","Saints Row"], a:1, d:["moyen"] },
    { q:"Quelle princesse Mario doit-il souvent sauver ?", o:["Daisy","Peach","Rosalina","Zelda"], a:1, d:["facile"] },
    { q:"Quel jeu d'horreur met en scene des animatroniques ?", o:["Outlast","Five Nights at Freddy's","Dead Space","Amnesia"], a:1, d:["moyen"] },
    { q:"Quelle est la console portable iconique de Nintendo des annees 90 ?", o:["PSP","Game Boy","Atari","Sega Game Gear"], a:1, d:["moyen"] },
    { q:"Dans 'Minecraft', quel monstre vert explose pres de vous ?", o:["Zombie","Creeper","Enderman","Squelette"], a:1, d:["facile"] },
    { q:"Quel jeu MOBA oppose deux equipes de 5 sur des lignes ?", o:["Overwatch","League of Legends","Valorant","Rocket League"], a:1, d:["moyen"] },
    { q:"Quel personnage est l'archeologue de 'Tomb Raider' ?", o:["Nathan Drake","Lara Croft","Aloy","Bayonetta"], a:1, d:["moyen"] },
    { q:"Quel jeu de course est exclusif a Nintendo avec des karts ?", o:["Forza","Mario Kart","Gran Turismo","Need for Speed"], a:1, d:["facile"] },
    { q:"Quelle entreprise a cree la PlayStation ?", o:["Microsoft","Sony","Nintendo","Sega"], a:1, d:["facile"] },
    { q:"Dans 'Elden Ring', quel studio japonais l'a developpe ?", o:["Capcom","FromSoftware","Square Enix","Konami"], a:1, d:["difficile"] }
  ],
  musique: [
    { q:"Quel groupe a chante 'Bohemian Rhapsody' ?", o:["The Beatles","Queen","Rolling Stones","Pink Floyd"], a:1, d:["moyen"] },
    { q:"Qui est surnomme le 'Roi de la Pop' ?", o:["Elvis Presley","Michael Jackson","Prince","Freddie Mercury"], a:1, d:["facile"] },
    { q:"Combien de cordes a une guitare classique ?", o:["4","5","6","7"], a:2, d:["facile"] },
    { q:"Quel instrument a des touches noires et blanches ?", o:["Violon","Piano","Flute","Trompette"], a:1, d:["facile"] },
    { q:"Quelle chanteuse est connue pour 'Rolling in the Deep' ?", o:["Beyonce","Adele","Rihanna","Lady Gaga"], a:1, d:["moyen"] },
    { q:"Quel genre musical est ne en Jamaique ?", o:["Le jazz","Le reggae","La salsa","Le blues"], a:1, d:["moyen"] },
    { q:"Combien de musiciens dans un quatuor ?", o:["2","3","4","5"], a:2, d:["facile"] },
    { q:"Quel compositeur, devenu sourd, a ecrit la 9e Symphonie ?", o:["Mozart","Beethoven","Bach","Chopin"], a:1, d:["difficile"] },
    { q:"Quel groupe britannique comptait John, Paul, George et Ringo ?", o:["The Rolling Stones","The Beatles","The Who","Oasis"], a:1, d:["moyen"] },
    { q:"Quel style de musique japonaise accompagne souvent les animes en intro ?", o:["Le J-Pop / opening","Le fado","Le flamenco","Le gospel"], a:0, d:["moyen"] },
    { q:"Combien de notes dans une gamme de Do majeur (sans alterations) ?", o:["5","7","8","12"], a:1, d:["difficile"] },
    { q:"Quel rappeur americain a sorti l'album 'good kid, m.A.A.d city' ?", o:["Drake","Kendrick Lamar","Jay-Z","Eminem"], a:1, d:["difficile"] },
    { q:"Quel instrument joue-t-on avec un archet ?", o:["La harpe","Le violon","Le tambour","La trompette"], a:1, d:["facile"] },
    { q:"Quelle artiste a chante 'Shake It Off' ?", o:["Katy Perry","Taylor Swift","Ariana Grande","Dua Lipa"], a:1, d:["facile"] },
    { q:"Quel pays est l'origine du tango ?", o:["Espagne","Argentine","Mexique","Bresil"], a:1, d:["moyen","difficile"] },
    { q:"Quel DJ francais a compose 'Titanium' ?", o:["David Guetta","Martin Garrix","Avicii","Calvin Harris"], a:0, d:["moyen"] },
    { q:"Quel instrument a 88 touches ?", o:["Orgue","Piano","Accordeon","Clavecin"], a:1, d:["moyen"] },
    { q:"Quelle chanteuse est surnommee 'Queen B' ?", o:["Beyonce","Rihanna","Madonna","Cardi B"], a:0, d:["moyen"] },
    { q:"Quel genre est associe a Bob Marley ?", o:["Rock","Reggae","Hip-hop","Pop"], a:1, d:["facile"] },
    { q:"Combien de symphonies Beethoven a-t-il completees ?", o:["5","9","12","3"], a:1, d:["difficile"] }
  ],
  geographie: [
    { q:"Quel est le plus grand pays du monde par superficie ?", o:["Chine","Russie","Canada","USA"], a:1, d:["moyen"] },
    { q:"Sur quel continent se trouve l'Egypte ?", o:["Asie","Afrique","Europe","Oceanie"], a:1, d:["facile"] },
    { q:"Quelle est la capitale de l'Italie ?", o:["Milan","Rome","Venise","Naples"], a:1, d:["facile"] },
    { q:"Quel est le plus haut sommet du monde ?", o:["K2","Everest","Mont Blanc","Kilimandjaro"], a:1, d:["facile"] },
    { q:"Quel desert est le plus grand chaud du monde ?", o:["Gobi","Sahara","Kalahari","Atacama"], a:1, d:["moyen"] },
    { q:"Combien d'oceans y a-t-il sur Terre ?", o:["3","4","5","6"], a:2, d:["moyen"] },
    { q:"Quelle est la capitale du Japon ?", o:["Tokyo","Pekin","Seoul","Bangkok"], a:0, d:["facile"] },
    { q:"Quel fleuve traverse Paris ?", o:["Le Rhone","La Seine","La Loire","La Garonne"], a:1, d:["facile"] },
    { q:"Quel pays a la plus grande population ?", o:["Chine","Inde","USA","Indonesie"], a:1, d:["difficile"] },
    { q:"Quelle chaine de montagnes separe l'Europe de l'Asie ?", o:["Les Alpes","L'Oural","L'Himalaya","Les Andes"], a:1, d:["difficile"] },
    { q:"Quelle est la capitale de l'Australie ?", o:["Sydney","Melbourne","Canberra","Perth"], a:2, d:["difficile"] },
    { q:"Quel pays est en forme de botte ?", o:["Espagne","Italie","Grece","Portugal"], a:1, d:["facile"] },
    { q:"Quel est le plus long fleuve d'Afrique ?", o:["Congo","Nil","Niger","Zambeze"], a:1, d:["moyen"] },
    { q:"Sur quel continent se trouve le Bresil ?", o:["Afrique","Amerique du Sud","Asie","Europe"], a:1, d:["facile"] },
    { q:"Quelle ville est surnommee la Ville Lumiere ?", o:["Londres","Paris","Rome","New York"], a:1, d:["facile"] },
    { q:"Quel detroit separe l'Europe de l'Afrique ?", o:["Gibraltar","Bosphore","Bering","Magellan"], a:0, d:["difficile"] },
    { q:"Quel pays possede le plus de fuseaux horaires ?", o:["Russie","USA","France","Chine"], a:2, d:["difficile"] },
    { q:"Quelle est la capitale du Canada ?", o:["Toronto","Montreal","Ottawa","Vancouver"], a:2, d:["moyen","difficile"] },
    { q:"Quel ocean borde la cote ouest des Etats-Unis ?", o:["Atlantique","Pacifique","Indien","Arctique"], a:1, d:["facile"] },
    { q:"Quelle est la plus grande ile du monde ?", o:["Madagascar","Groenland","Borneo","Australie (continent)"], a:1, d:["difficile"] }
  ]
};

const THEMES = [
  { id:'mangas_animes',    name:'Mangas & Animes',  emoji:'🌸' },
  { id:'evenements_animes',name:'Evenements d\'animes', emoji:'⚔️' },
  { id:'jeux_video',       name:'Jeux video',       emoji:'🎮' },
  { id:'culture_generale', name:'Culture generale', emoji:'🌍' },
  { id:'japon',            name:'Japon & Culture',  emoji:'🦊' },
  { id:'sciences',         name:'Sciences',         emoji:'🔬' },
  { id:'histoire',         name:'Histoire',         emoji:'🏛️' },
  { id:'sport',            name:'Sport',            emoji:'⚽' },
  { id:'cinema',           name:'Cinema',           emoji:'🎬' },
  { id:'musique',          name:'Musique',          emoji:'🎵' },
  { id:'geographie',       name:'Geographie',       emoji:'🗺️' }
];
const DIFFICULTIES = [
  { id:'facile',    name:'Facile',    proba:0.50 },
  { id:'moyen',     name:'Moyen',     proba:0.70 },
  { id:'difficile', name:'Difficile', proba:0.90 }
];

function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// Melange les options d'une question tout en gardant la bonne reponse
function shuffleOptions(item){
  const idxs = item.o.map((_,i)=>i);
  const order = shuffle(idxs);
  const options = order.map(i=>item.o[i]);
  const correct = order.indexOf(item.a);
  return { options, correct };
}

/* Genere n questions pour un theme et une difficulte donnes.
   On privilegie les questions taggees pour cette difficulte, puis on complete. */
function genererQuestions(theme, difficulte, n){
  n = n || 10;
  const themeKey = BANK[theme] ? theme : 'culture_generale';
  const diff = DIFFICULTIES.find(d=>d.id===difficulte) ? difficulte : 'moyen';
  const time = TIME_BY_DIFF[diff] || 15;

  const all = BANK[themeKey];
  const matching = all.filter(it => it.d.includes(diff));
  const others   = all.filter(it => !it.d.includes(diff));
  let pool = shuffle(matching).concat(shuffle(others));

  // si pas assez, on complete avec la culture generale
  if(pool.length < n){
    const extra = shuffle(BANK.culture_generale.filter(it=>!pool.includes(it)));
    pool = pool.concat(extra);
  }
  const selected = pool.slice(0, n);

  return selected.map(item => {
    const { options, correct } = shuffleOptions(item);
    return { type:'qcm', text:item.q, options, correct:[correct], time };
  });
}

module.exports = { THEMES, DIFFICULTIES, genererQuestions };
