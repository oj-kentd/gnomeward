"""Gnomeward original art. Run: blender --background --python art/generate_assets.py
All world geometry and character portrait imagery are authored and exported by Blender.
"""
import bpy, math, os, random
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','assets')
os.makedirs(OUT,exist_ok=True)
random.seed(21)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
def mat(name,c,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;M[name]=m;return m
for n,c in {'cream':(.92,.85,.66),'beard':(.96,.95,.84),'skin':(.83,.51,.29),'boot':(.13,.08,.05),'belt':(.26,.15,.08),'gold':(.94,.61,.12),'white':(1,.98,.88),'ink':(.045,.035,.07),'red':(.7,.075,.065),'green':(.21,.43,.16),'purple':(.42,.17,.59),'orange':(.88,.32,.075),'pink':(.98,.27,.55),'teal':(.065,.51,.51),'blue':(.15,.34,.61),'wood':(.31,.16,.08),'leaf':(.2,.42,.17),'leafLight':(.38,.61,.23),'rock':(.43,.49,.42),'grass':(.32,.47,.24),'path':(.69,.56,.35),'crystal':(.46,.65,.95)}.items():mat(n,c)
parts=[]
def add(o,name,loc,scale,material):
 o.name=name;o.location=loc;o.scale=scale;o.data.materials.append(M[material]);parts.append(o);return o
def uv(name,loc,scale,material,segments=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings);o=add(bpy.context.object,name,loc,scale,material)
 for p in o.data.polygons:p.use_smooth=True
 return o
def ico(name,loc,scale,material,sub=1):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub);return add(bpy.context.object,name,loc,scale,material)
def cube(name,loc,scale,material,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1);o=add(bpy.context.object,name,loc,scale,material)
 if bevel:
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);mod=o.modifiers.new('Soft toy seams','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cone(name,loc,r1,r2,depth,material,verts=16):
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth);return add(bpy.context.object,name,loc,(1,1,1),material)
def rod(name,a,b,r,material):
 a,b=Vector(a),Vector(b);o=cone(name,(a+b)/2,r,r,(b-a).length,material,10);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def torus(name,loc,r,minor,material):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,major_radius=r,minor_radius=minor);return add(bpy.context.object,name,loc,(1,1,1),material)
def bent_hat(color):
 rings=[(0,0,.79,.36),(0,0,.87,.36),(0,.01,1.02,.3),(.015,.015,1.17,.235),(.055,.01,1.33,.17),(.15,0,1.45,.12),(.26,-.015,1.44,.07),(.3,-.02,1.36,.025)]
 v=[];f=[];s=20
 for x,y,z,r in rings:
  for j in range(s):
   a=j*2*math.pi/s;v.append((x+r*math.cos(a),y+r*math.sin(a),z))
 for i in range(len(rings)-1):
  for j in range(s):a=i*s+j;b=i*s+(j+1)%s;f.append((a,b,b+s,a+s))
 f.append(tuple(reversed(range(s))));f.append(tuple(range((len(rings)-1)*s,len(rings)*s)))
 mesh=bpy.data.meshes.new('Bent wool hat');mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new('Drooping wool hat',mesh);bpy.context.collection.objects.link(o);add(o,o.name,(0,0,0),(1,1,1),color)
 for p in mesh.polygons:p.use_smooth=True
 for z,r in [(.83,.356),(.9,.337),(.97,.307)]:torus('Wool knitted rib',(0,0,z),r,.011,color)
 uv('Red pompom',(.30,-.02,1.33),(.11,.11,.11),'red')
 for i in range(9):
  a=i*2.4;uv('Pompom fluff',(.3+.075*math.sin(a),-.02+.075*math.cos(a),1.33+.05*math.sin(i)),(.04,.04,.045),'red',8,6)
def gnome(kind,color):
 uv('Plaid coat',(0,0,.43),(.36,.29,.38),color)
 # Tartan patches encircle the plush coat.
 for j in range(12):
  a=j*math.tau/12
  for row in range(2):
   o=cube('Woven plaid stripe',(.337*math.sin(a),.274*math.cos(a),.30+row*.16),(.095,.024,.11),'ink' if (j+row)%2==0 else 'red',.006);o.rotation_euler.z=-a
 for x in [-.19,.19]:uv('Suede boots',(x,-.11,.1),(.19,.27,.11),'boot')
 uv('Fluffy beard',(0,-.275,.51),(.30,.17,.27),'beard')
 cone('Pointed beard',(0,-.235,.29),.018,.17,.30,'beard')
 for x in [-.16,-.08,0,.08,.16]:uv('Beard tuft',(x,-.355,.43-abs(x)*.3),(.045,.035,.17),'white')
 bent_hat(color)
 uv('Big button nose',(0,-.375,.77),(.145,.13,.12),'skin')
 for x in [-.36,.36]:uv('Mittens',(x,-.04,.48),(.115,.12,.13),'skin')
 if kind=='sprout':
  rod('Slingshot handle',(.37,-.15,.38),(.37,-.15,.76),.045,'wood')
  for x in [.24,.49]:rod('Slingshot fork',(.37,-.15,.66),(x,-.15,.88),.04,'wood')
  rod('Slingshot elastic',(.24,-.15,.87),(.49,-.15,.87),.009,'gold')
 elif kind=='spore':
  cone('Mushroom staff',(.40,-.18,.69),.045,.045,.73,'wood')
  uv('Purple mushroom',(.40,-.18,1.01),(.23,.20,.115),'purple')
  for x,y in [(.3,-.20),(.45,-.26),(.48,-.1)]:uv('White mushroom spots',(x,y,1.09),(.036,.03,.016),'white')
 elif kind=='boom':
  uv('Round bomb',(.4,-.20,.58),(.18,.18,.18),'ink')
  rod('Bomb fuse',(.4,-.2,.74),(.47,-.2,.86),.018,'wood');ico('Fuse spark',(.47,-.2,.86),(.065,.065,.065),'gold')
 elif kind in ['stun','sniper','multi']:
  xs=[-.37,.37] if kind=='multi' else [.38]
  for x in xs:
   length=.65 if kind=='sniper' else .34
   cube('Weapon body',(x,-.30,.63),(.14,length,.13),color,.024)
   rod('Weapon barrel',(x,-.35,.64),(x,-(.60 if kind=='sniper' else .52),.64),.043,'gold')
   cube('Weapon stock',(x,-.17,.50),(.075,.095,.20),'wood',.012)
   if kind=='sniper':rod('Scope',(x,-.2,.76),(x,-.4,.76),.044,'ink')
   if kind=='stun':torus('Pulse muzzle',(x,-.52,.64),.072,.016,'pink').rotation_euler.x=math.pi/2
 return parts

def skeleton(boss=False):
 bone='purple' if boss else 'cream'
 for x in [-.14,.14]:
  uv('Bony foot',(x,-.095,.065),(.105,.16,.065),bone)
  rod('Shin',(x,0,.12),(x,0,.36),.035,bone);uv('Knee',(x,0,.36),(.055,.055,.055),bone)
  rod('Thigh',(x,0,.38),(x*.7,0,.58),.045,bone)
 uv('Pelvis',(0,0,.57),(.19,.085,.075),bone)
 rod('Spine',(0,0,.58),(0,0,1.02),.043,bone)
 for z,w in [(.71,.18),(.79,.20),(.87,.21),(.95,.20)]:
  for sign in [-1,1]:rod('Ribs',(sign*.025,-.045,z),(sign*w,-.025,z+.025),.028,bone)
 for sign in [-1,1]:
  rod('Shoulders',(0,0,1.0),(sign*.27,0,1.0),.04,bone)
  rod('Arm',(sign*.27,0,1.0),(sign*.33,-.03,.78),.04,bone)
  rod('Forearm',(sign*.33,-.03,.78),(sign*.37,-.1,.60),.034,bone)
  uv('Hand',(sign*.37,-.1,.58),(.06,.04,.075),bone)
 uv('Skull',(0,-.01,1.22),(.215,.155,.22),bone)
 cube('Jaw',(0,-.052,1.05),(.26,.16,.10),bone,.02)
 for x in [-.083,.083]:uv('Deep eye socket',(x,-.148,1.245),(.065,.032,.075),'ink');uv('Eye ember',(x,-.177,1.24),(.019,.008,.023),'pink' if boss else 'gold')
 ico('Nose socket',(0,-.166,1.15),(.038,.017,.04),'ink')
 for x in [-.08,-.027,.027,.08]:cube('Tooth',(x,-.14,1.072),(.035,.035,.055),'white',.003)
 if boss:
  torus('Crown band',(0,0,1.41),.195,.038,'gold')
  for i in range(6):a=i*math.tau/6;cone('Crown point',(.18*math.cos(a),.18*math.sin(a),1.51),.047,0,.23,'gold',5)
  uv('Royal jewel',(0,-.218,1.43),(.04,.022,.05),'pink')
  for o in parts:o.location*=1.4;o.scale*=1.4

def reset():
 global parts
 bpy.ops.object.select_all(action='DESELECT');parts=[]
def export(name):
 bpy.ops.object.select_all(action='DESELECT')
 for p in parts:p.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 bpy.ops.object.join();obj=bpy.context.object;obj.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_apply=True)
 obj.hide_render=True;obj.hide_set(True);return obj
assets={}
for k,c in [('sprout','green'),('spore','purple'),('boom','orange'),('stun','pink'),('multi','teal'),('sniper','blue')]:reset();gnome(k,c);assets[k]=export('gnome-'+k)
for name,boss in [('skeleton',False),('skeleton-boss',True)]:reset();skeleton(boss);assets[name]=export(name)
reset();cone('Tree trunk',(0,0,.8),.16,.10,1.6,'wood');
for z,r in [(1.1,.8),(1.6,.65),(2.03,.45)]:cone('Evergreen canopy',(0,0,z),r,.04,.9,'leaf' if z==1.1 else 'leafLight',9)
assets['tree']=export('tree')
reset()
for loc,scale in [((0,0,.28),(.5,.42,.4)),((-.28,.05,.20),(.31,.3,.28)),((.3,.05,.22),(.3,.28,.3))]:ico('Bush',loc,scale,'leafLight',2)
assets['bush']=export('bush')
reset();ico('Mossy stone',(0,0,.24),(.48,.36,.35),'rock',1);assets['rock']=export('rock')
reset();rod('Flower stem',(0,0,0),(0,0,.28),.018,'leaf');uv('Flower center',(0,0,.28),(.065,.065,.035),'gold')
for i in range(5):a=i*math.tau/5;uv('Petal',(.085*math.cos(a),.085*math.sin(a),.28),(.07,.055,.025),'white',10,6)
assets['flower']=export('flower')
reset();cone('Mushroom stem',(0,0,.15),.045,.045,.3,'cream');uv('Mushroom cap',(0,0,.3),(.21,.21,.10),'purple')
for x,y in [(-.08,-.03),(.06,-.1),(.06,.09)]:uv('Mushroom spot',(x,y,.39),(.03,.03,.015),'white',8,6)
assets['mushroom']=export('mushroom')
reset();cube('Cottage walls',(0,0,.58),(1.5,1.25,1.16),'cream',.07)
for x in [-.44,.44]:
 o=cube('Scarlet roof',(x,0,1.37),(.99,1.5,.16),'red',.02);o.rotation_euler.y=(-1 if x<0 else 1)*.57
cube('Cottage door',(0,-.646,.39),(.38,.07,.76),'wood',.08)
for x in [-.46,.46]:cube('Window',(x,-.66,.71),(.29,.06,.29),'blue',.03);rod('Window trim',(x-.14,-.71,.71),(x+.14,-.71,.71),.017,'cream')
cube('Chimney',(.43,.18,1.68),(.22,.24,.56),'rock',.02);assets['house']=export('house')
reset()
for x in [-.45,.45]:cube('Fence post',(x,0,.31),(.10,.10,.62),'wood',.015)
for z in [.21,.46]:cube('Fence rail',(0,0,z),(1,.07,.09),'cream',.01)
assets['fence']=export('fence')
reset();cone('Magic crystal',(0,0,.38),.24,0,.76,'crystal',5);assets['crystal']=export('crystal')
for n,m in [('ground','grass'),('path','path')]:reset();cube(n,(0,0,0),(1,1,1),m);assets[n]=export(n)
reset();uv('Seed projectile',(0,0,0),(1,1,1),'gold',10,6);assets['projectile']=export('projectile')
reset();torus('Range ring',(0,0,.012),1,.013,'white');assets['ring']=export('ring')
reset();ico('Burst',(0,0,0),(1,1,1),'orange',2);assets['explosion']=export('explosion')
# Seasonal props for the five playtest maps.
mat('water',(.12,.48,.62),rough=.25)
reset();cube('Creek water',(0,0,0),(1,1,1),'water');assets['water']=export('water')
reset()
for i in range(8):
 a=i*math.tau/8;uv('Pumpkin rib',(.13*math.cos(a),.13*math.sin(a),.22),(.16,.16,.22),'orange',12,8)
rod('Pumpkin stem',(0,0,.39),(.04,0,.52),.035,'wood')
ico('Pumpkin leaf',(.09,0,.44),(.12,.065,.027),'leaf')
assets['pumpkin']=export('pumpkin')
reset();cone('Apple trunk',(0,0,.7),.14,.085,1.4,'wood')
for a in [0,2.1,4.2]:rod('Apple branch',(0,0,.7),(.45*math.cos(a),.45*math.sin(a),1.55),.055,'wood')
for loc,scale in [((0,0,1.8),(.8,.7,.75)),((-.45,0,1.55),(.47,.50,.5)),((.45,0,1.57),(.48,.48,.5))]:ico('Round apple canopy',loc,scale,'leafLight',2)
for i in range(10):
 a=i*2.4;z=1.4+(i%3)*.25;uv('Red apple',(.65*math.cos(a),.58*math.sin(a),z),(.085,.085,.085),'red',10,7)
assets['apple-tree']=export('apple-tree')
# Reproducible portrait lighting: softly lit clay-like plush toys.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35)
def area(name,loc,power,size):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.7))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm softbox',(-3,-4,5),380,4);area('Cool fill',(3,-1,3),220,3);area('Rim light',(1,3,4),450,3)
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.74))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.95;scene.camera=cam
scene.view_settings.view_transform='AgX'
for kind in ['sprout','spore','boom','stun','multi','sniper']:
 obj=assets[kind];obj.hide_render=False;obj.hide_set(False);scene.render.filepath=os.path.join(OUT,kind+'.png');bpy.ops.render.render(write_still=True);obj.hide_render=True;obj.hide_set(True)
# Hero is an original Blender group render, with no external imagery.
for i,k in enumerate(['sniper','spore','sprout','stun','boom','multi']):
 o=assets[k];o.hide_render=False;o.hide_set(False);o.location=(i*1.05-2.625,0,.10*math.sin(i));o.rotation_euler.z=(-.12 if i<3 else .12)
scene.render.resolution_x=1400;scene.render.resolution_y=650;cam.location=(2,-8,4.0);cam.rotation_euler=(Vector((0,0,.72))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=7.4
scene.render.filepath=os.path.join(OUT,'hero.png');bpy.ops.render.render(write_still=True)
for k in ['sprout','spore','boom','stun','multi','sniper']:assets[k].location=(0,0,0);assets[k].rotation_euler=(0,0,0);assets[k].hide_render=True;assets[k].hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','gnomeward.blend'),compress=True)
print('GNOMEWARD_ASSETS_COMPLETE')
