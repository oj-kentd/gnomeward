"""Original Gnomeward necromancer and friendly spectral ally, authored in Blender.
Run: blender --background --python art/generate_necromancer.py
Writes only gnome-necro.glb, necro.png, reborn-gnome.glb, soul-puff.glb,
secret-pumpkin-{moon,star,leaf,flame}.glb, necro-clue.glb,
art/necromancer-preview.png and art/necromancer.blend. Existing assets are preserved.
All exports have base Y=0 and front +Z in glTF / Three.js.
"""
from pathlib import Path
shared=Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0],str(Path(__file__).with_name('generate_assets.py')),'exec'))

mat('morrow-plum',(.185,.095,.24),rough=.9)
mat('morrow-charcoal',(.075,.09,.095),rough=.9)
mat('soul-seafoam',(.14,.49,.40),rough=.85)
mat('soul-mint',(.40,.81,.61),rough=.82)
mat('soul-ivory',(.76,.94,.76),rough=.82)
mat('soul-wood',(.39,.25,.14),rough=.85)
mat('soul-glow',(.28,.92,.67),rough=.5)
p=M['soul-glow'].node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(.28,.92,.67,1)
p.inputs['Emission Strength'].default_value=.45

# Friendly curved rune rather than skulls or gore.
def moon(loc,radius,material):
    points=[]
    for i in range(16):
        a=math.radians(55)+i*math.radians(255)/15
        points.append((loc[0]+radius*math.cos(a),loc[1],loc[2]+radius*math.sin(a)))
    for i in range(len(points)-1):rod('Soft crescent rune',points[i],points[i+1],.012,material)
    for pos in [points[0],points[-1]]:uv('Rounded rune end',pos,(.012,.012,.012),material,8,6)

def ground_parts(target_height=None):
    # Shared original gnome builder has boots extending .01 beneath zero.
    # Bake local transforms and raise the mesh parts to a precise common base.
    bpy.context.view_layer.update()
    points=[obj.matrix_world@Vector(corner) for obj in parts for corner in obj.bound_box]
    low=min(p.z for p in points);high=max(p.z for p in points)
    factor=target_height/(high-low) if target_height else 1
    for obj in parts:
        obj.location.z-=low
        obj.location*=factor
        obj.scale*=factor

assets={}
reset();gnome('necro','morrow-plum')
for obj in parts:
    if obj.name.startswith('Plaid coat'):
        obj.data.materials.clear();obj.data.materials.append(M['morrow-charcoal'])
    elif obj.name.startswith('Woven plaid stripe'):
        obj.data.materials.clear();obj.data.materials.append(M['morrow-plum'])
torus('Charcoal wool hat cuff',(0,0,.846),.362,.021,'morrow-charcoal')
moon((-.08,-.286,1.095),.064,'soul-mint')
for pos,r in [((.085,-.245,1.19),.018),((-.18,-.232,1.22),.012)]:uv('Mint stitch star',pos,(r,.01,r),'soul-mint',8,6)
rod('Soul staff',(.43,-.16,.25),(.43,-.16,1.03),.033,'morrow-charcoal')
torus('Staff mint collar',(.43,-.16,.98),.06,.018,'soul-mint')
uv('Friendly soul orb',(.43,-.16,1.13),(.135,.12,.15),'soul-glow',20,12)
# Three soft lobes form the gently rising soul flame.
uv('Soul flame rise',(.46,-.15,1.265),(.068,.066,.11),'soul-mint',16,10)
uv('Soul flame tip',(.505,-.148,1.335),(.034,.037,.063),'soul-ivory',12,8)
o=torus('Soul orb halo',(.43,-.16,1.13),.172,.017,'soul-ivory');o.rotation_euler.x=.48
for a in [0,math.pi]:uv('Orbiting mint mote',(.43+.19*math.cos(a),-.16,1.13+.07*math.sin(a)),(.031,.031,.031),'soul-glow',10,7)
ground_parts()
assets['necro']=export('gnome-necro')

reset();gnome('reborn','soul-mint')
for obj in parts:
    if obj.name.startswith('Plaid coat'):
        material='soul-seafoam'
    elif obj.name.startswith(('Woven plaid stripe','Suede boots')):
        material='soul-seafoam'
    elif obj.name.startswith(('Fluffy beard','Pointed beard','Beard tuft')):
        material='soul-ivory'
    elif obj.name.startswith(('Red pompom','Pompom fluff')):
        material='soul-glow'
    elif obj.name.startswith(('Big button nose','Mittens')):
        material='soul-mint'
    else:continue
    obj.data.materials.clear();obj.data.materials.append(M[material])
# Rounded shield at left hand; wooden practice sword at right hand.
uv('Rounded spectral shield',(-.37,-.185,.55),(.17,.085,.205),'soul-seafoam',20,12)
uv('Ivory shield face',(-.37,-.257,.55),(.13,.034,.161),'soul-ivory',16,10)
uv('Mint shield boss',(-.37,-.294,.55),(.052,.023,.052),'soul-mint',12,8)
rod('Wooden sword grip',(.39,-.13,.43),(.39,-.13,.60),.035,'soul-wood')
cube('Rounded wooden blade',(.39,-.13,.795),(.086,.062,.37),'soul-wood',.025)
uv('Soft sword tip',(.39,-.13,.985),(.043,.031,.056),'soul-wood',12,8)
cube('Wooden crossguard',(.39,-.13,.61),(.225,.08,.063),'soul-wood',.025)
# Mint halo is subtle and leaves the shared plush silhouette readable.
torus('Ally mint hat stitch',(0,0,.853),.36,.012,'soul-ivory')
ground_parts(1.05)
assets['reborn']=export('reborn-gnome')

reset()
# Unit-scale, fully 3D toy puffs support fade/scale animation in the renderer.
for loc,sc,m in [((0,0,.27),(.24,.22,.25),'soul-glow'),((-.18,.02,.17),(.16,.15,.16),'soul-mint'),((.17,.02,.20),(.16,.16,.19),'soul-ivory'),((.035,.015,.52),(.11,.10,.13),'soul-mint')]:
    uv('Soft rising soul puff',loc,sc,m,12,8)
for loc in [(-.30,-.02,.40),(.26,.025,.51),(-.045,.025,.71)]:uv('Little soul mote',loc,(.039,.039,.045),'soul-glow',10,7)
ground_parts()
assets['soul-puff']=export('soul-puff')

# Pumpkin Hollow secret: ordinary pumpkins with subtle upper-front carvings.
mat('puzzle-pumpkin',(.94,.42,.12),rough=.88)
mat('puzzle-leaf',(.37,.60,.25),rough=.88)
mat('pumpkin-rune',(.78,.65,.40),rough=.84)
# A neutral inactive rune; the renderer may enable emissive feedback on discovery.
p=M['pumpkin-rune'].node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(.78,.65,.40,1)
p.inputs['Emission Strength'].default_value=0
mat('plaque-wood',(.35,.205,.105),rough=.9)
mat('plaque-trim',(.57,.365,.18),rough=.86)

def icon(kind,center,scale=1,tilt=math.pi/4):
    center=Vector(center)
    vertical=Vector((0,math.sin(tilt),math.cos(tilt)))
    normal=Vector((0,-math.cos(tilt),math.sin(tilt)))
    def point(u,v,depth=0):return center+Vector((u*scale,0,0))+vertical*v*scale+normal*depth
    def stroke(points,width=.009):
        for i in range(len(points)-1):rod('Carved '+kind,point(*points[i]),point(*points[i+1]),width*scale,'pumpkin-rune')
        for u,v in [points[0],points[-1]]:uv('Soft rune endpoint',point(u,v),(width*scale,)*3,'pumpkin-rune',8,6)
    def silhouette(poly):
        vertices=[point(u,v,depth) for depth in [-.003,.007] for u,v in poly];n=len(poly)
        faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
        for i in range(n):j=(i+1)%n;faces.append((i,j,j+n,i+n))
        mesh=bpy.data.meshes.new(kind+' carved symbol');mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(kind+' carved symbol',mesh);bpy.context.collection.objects.link(obj);add(obj,obj.name,(0,0,0),(1,1,1),'pumpkin-rune')
    if kind=='moon':
        stroke([(.063*math.cos(math.radians(55+i*250/18)),.063*math.sin(math.radians(55+i*250/18))) for i in range(19)],.011)
    elif kind=='star':
        poly=[]
        for i in range(10):
            a=math.pi/2+i*math.pi/5;r=.080 if i%2==0 else .034;poly.append((math.cos(a)*r,math.sin(a)*r))
        silhouette(poly)
    elif kind=='leaf':
        silhouette([(-.053,-.057),(-.064,-.018),(-.055,.025),(-.014,.066),(.059,.085),(.062,.028),(.046,-.022),(.010,-.050)])
        stroke([(-.048,-.056),(.024,.037)],.005)
    else:
        silhouette([(-.048,-.052),(-.063,-.022),(-.061,.018),(-.033,.065),(-.025,.029),(.013,.102),(.043,.057),(.059,.012),(.055,-.031),(.031,-.057),(0,-.070)])

for symbol in ['moon','star','leaf','flame']:
    reset()
    for i in range(9):
        a=i*math.tau/9;uv('Ordinary soft pumpkin rib',(.115*math.cos(a),.115*math.sin(a),.225),(.172,.17,.22),'puzzle-pumpkin',16,10)
    rod('Pumpkin stem',(0,0,.40),(.035,0,.51),.032,'soul-wood')
    uv('Round stem tip',(.035,0,.51),(.032,.032,.032),'soul-wood',10,7)
    uv('Pumpkin leaf',(.105,.015,.446),(.11,.065,.029),'puzzle-leaf',12,8)
    icon(symbol,(0,-.242,.37),1,math.pi/4)
    ground_parts()
    assets['pumpkin-'+symbol]=export('secret-pumpkin-'+symbol)

reset()
cube('Cottage clue plaque',(0,0,.175),(.54,.065,.35),'plaque-wood',.025)
cube('Clue plaque top trim',(0,-.045,.332),(.49,.032,.023),'plaque-trim',.009)
cube('Clue plaque lower trim',(0,-.045,.019),(.49,.032,.023),'plaque-trim',.009)
for x,symbol in zip([-.183,-.061,.061,.183],['moon','star','leaf','flame']):icon(symbol,(x,-.041,.172),.56,0)
for x in [-.236,.236]:
    for z in [.053,.295]:uv('Wood peg',(x,-.036,z),(.013,.012,.013),'plaque-trim',8,6)
assets['necro-clue']=export('necro-clue')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((.055,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.0;scene.camera=cam
obj=assets['necro'];obj.hide_render=False;obj.hide_set(False)
scene.render.filepath=os.path.join(OUT,'necro.png');bpy.ops.render.render(write_still=True)
# Side-by-side transparent review image, including actual relative sizes.
assets['necro'].location=(-.80,.65,0)
assets['reborn'].hide_render=False;assets['reborn'].hide_set(False);assets['reborn'].location=(.55,.65,0)
assets['soul-puff'].hide_render=False;assets['soul-puff'].hide_set(False);assets['soul-puff'].location=(1.24,.65,0);assets['soul-puff'].scale*=.5
for x,symbol in zip([-1.04,-.35,.34,1.03],['moon','star','leaf','flame']):
    obj=assets['pumpkin-'+symbol];obj.hide_render=False;obj.hide_set(False);obj.location=(x,-.53,0)
obj=assets['necro-clue'];obj.hide_render=False;obj.hide_set(False);obj.location=(1.43,.22,.16)
cam.location=(2,-6,3.8);cam.rotation_euler=(Vector((.05,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.1
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.filepath=os.path.join(ROOT,'art','necromancer-preview.png');bpy.ops.render.render(write_still=True)
# Keep the complete editable review collection with visible characters.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','necromancer.blend'),compress=True)
print('GNOMEWARD_NECROMANCER_COMPLETE')
