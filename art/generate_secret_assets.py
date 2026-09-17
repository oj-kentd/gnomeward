"""Original secret characters and world props for Gnomeward.
Run: blender --background --python art/generate_secret_assets.py
Reuses only the shared construction definitions from generate_assets.py; existing
assets are not regenerated. Saves an editable art/secrets.blend collection.
"""
from pathlib import Path
# Execute shared primitive/gnome builders, stopping before any asset exports.
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

def glow(name, color, strength=.6):
    m=mat(name,color,rough=.32)
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=strength
    return m

mat('cosmic-navy',(.10,.085,.27),rough=.8)
mat('wool-grey',(.39,.405,.39),rough=.95)
mat('cosmic-purple',(.36,.16,.62),rough=.7)
mat('blackhole-core',(.004,.003,.012),rough=1)
mat('rune-stone',(.29,.31,.34),rough=.95)
glow('cosmic-glow',(.59,.22,.95),.8)
glow('cosmic-teal',(.11,.76,.77),.6)
glow('prism-cyan',(.10,.71,.85),.25)
glow('prism-magenta',(.91,.13,.52),.2)
glow('prism-amber',(1,.57,.10),.2)
glow('secret-gem',(.84,.88,.92),.18)
glow('secret-glow',(.65,.72,.8),.4)

def gem(name,loc,radius,height,material,lean=0,rotation=0):
    # Six-sided jewel with a slender prism waist and pointed upper facets.
    n=6
    rings=[(0,.5*radius),(.16*height,radius),(.68*height,.94*radius),(height,0)]
    vertices=[]
    for z,r in rings:
        for i in range(n):
            a=i*math.tau/n+rotation
            vertices.append((math.cos(a)*r+lean*z,math.sin(a)*r,z))
    faces=[]
    for layer in range(len(rings)-1):
        for i in range(n):
            a=layer*n+i;b=layer*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces.append(tuple(reversed(range(n))))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    return add(ob,name,loc,(1,1,1),material)

assets={}
reset();gnome('gravity','red')
# Match the original plush reference: grey hat, red plaid body, ivory beard,
# and the shared gnome builder's red pompom. Magical color lives on the staff.
for obj in parts:
    if obj.name.startswith(('Drooping wool hat','Wool knitted rib')):
        obj.data.materials.clear();obj.data.materials.append(M['wool-grey'])
torus('Red wool hat rim',(0,0,.815),.361,.021,'red')
rod('Orbit staff',(.43,-.18,.23),(.43,-.18,1.04),.034,'cosmic-purple')
uv('Little black star',(.43,-.18,1.13),(.12,.12,.12),'blackhole-core')
o=torus('Staff orbit ring',(.43,-.18,1.13),.19,.021,'cosmic-glow');o.rotation_euler=(.9,.2,.25)
o=torus('Staff second orbit',(.43,-.18,1.13),.155,.014,'cosmic-teal');o.rotation_euler=(.1,.8,-.4)
uv('Orbiting star',(.61,-.20,1.19),(.036,.036,.036),'gold',10,7)
assets['gravity']=export('gnome-gravity')

reset();gnome('crystal','teal')
# Gems are mounted onto the wool hat and staff rather than replacing the plush silhouette.
torus('Turquoise hat trim',(0,0,.85),.365,.018,'prism-cyan')
for x,y,z,r,h,m,lean in [(-.16,-.255,.94,.035,.14,'prism-magenta',-.1),(.045,-.265,1.0,.042,.17,'prism-amber',.1),(.14,-.19,1.15,.03,.12,'prism-cyan',.1)]:
    gem('Hat gemstone',(x,y,z),r,h,m,lean)
rod('Crystal staff',(.43,-.16,.20),(.43,-.16,.96),.035,'gold')
gem('Cyan staff crystal',(.43,-.16,.92),.13,.43,'prism-cyan',.05)
gem('Magenta staff shard',(.32,-.15,.96),.06,.23,'prism-magenta',-.35)
gem('Amber staff shard',(.54,-.14,.98),.055,.21,'prism-amber',.30)
torus('Staff gold mount',(.43,-.16,.97),.12,.021,'gold')
assets['crystal']=export('gnome-crystal')

reset()
cone('Event horizon',(0,0,.012),.86,.86,.024,'blackhole-core',64)
torus('Outer violet orbit',(0,0,.027),.97,.03,'cosmic-glow')
torus('Inner teal orbit',(0,0,.034),.77,.019,'cosmic-teal')
torus('Inner violet orbit',(0,0,.039),.52,.013,'cosmic-glow')
# Curved spiral streaks lend rotation to the otherwise flat aperture.
for arm in range(3):
    previous=None
    for i in range(17):
        a=arm*math.tau/3+i*.105;r=.82-i*.023
        p=(r*math.cos(a),r*math.sin(a),.043)
        if previous:rod('Accretion swirl',previous,p,.011,'cosmic-teal' if arm==1 else 'cosmic-glow')
        previous=p
assets['black-hole']=export('black-hole')

reset()
cube('Barrier foundation',(0,0,.075),(1.16,.49,.15),'rock',.035)
for x,y,r,h,m,lean in [(-.44,.02,.15,.57,'prism-magenta',-.08),(-.21,-.025,.20,.79,'prism-cyan',-.07),(.09,.02,.23,.91,'prism-cyan',.03),(.36,-.015,.18,.68,'prism-amber',.1),(.49,.11,.10,.44,'prism-magenta',.08)]:
    gem('Barrier prism',(x,y,.12),r,h,m,lean)
for obj in parts:obj.location.x*=.96;obj.scale.x*=.96
assets['crystal-barrier']=export('crystal-barrier')

reset()
cone('Ancient rune stone',(0,0,.08),.56,.50,.16,'rune-stone',12)
# Etched-looking low relief rings and spiral, with three small recognition dots.
torus('Engraved outer ring',(0,0,.165),.375,.010,'cosmic-glow')
previous=None
for i in range(55):
    a=i*.17;r=.255-i*.0037;p=(r*math.cos(a),r*math.sin(a),.166)
    if previous:rod('Engraved spiral',previous,p,.009,'cosmic-glow')
    previous=p
for x in [-.11,0,.11]:uv('Three rune dots',(x,-.435,.163),(.022,.022,.009),'cosmic-glow',10,6)
assets['secret-rune']=export('secret-rune')

reset()
cone('Secret geode stone',(0,0,.075),.63,.52,.15,'rune-stone',9)
for x,y,r,h,lean in [(0,0,.23,.98,.04),(-.31,.03,.14,.67,-.17),(.31,.03,.15,.72,.18),(-.12,-.23,.12,.48,-.07),(.24,-.23,.11,.41,.20)]:
    gem('Secret gemstone',(x,y,.12),r,h,'secret-gem',lean,rotation=.2)
torus('Crystal discovery circle',(0,0,.153),.48,.018,'secret-glow')
assets['secret-crystal']=export('secret-crystal')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35)
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.7))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((.045,0,.74))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.0;scene.camera=cam
scene.view_settings.view_transform='AgX'
for key in ['gravity','crystal']:
    obj=assets[key];obj.hide_render=False;obj.hide_set(False);scene.render.filepath=os.path.join(OUT,key+'.png');bpy.ops.render.render(write_still=True);obj.hide_render=True;obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','secrets.blend'),compress=True)
print('GNOMEWARD_SECRET_ASSETS_COMPLETE')
