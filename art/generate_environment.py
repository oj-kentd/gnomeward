"""Rounded toy garden art for Gnomeward, matching the plush character family.
Run: blender --background --python art/generate_environment.py
Only exports the environmental asset names in this file. Character, enemy,
secret, effect, entry-arrow, portrait and music files are never rewritten.
The editable collection and presentation scene is art/environment.blend.
"""
from pathlib import Path
shared=Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0],str(Path(__file__).with_name('generate_assets.py')),'exec'))

for name,color in {'toy-bark':(.34,.18,.105),'toy-leaf':(.22,.46,.19),'toy-leaf-light':(.37,.60,.25),
                   'toy-leaf-lime':(.46,.64,.28),'toy-stone':(.49,.53,.45),'toy-cream':(.91,.82,.59),
                   'toy-roof':(.75,.22,.135),'toy-roof-light':(.90,.36,.18),'toy-door':(.29,.16,.095),
                   'toy-window':(.24,.57,.64),'toy-water':(.16,.56,.66),'toy-berry':(.81,.15,.09),
                   'toy-mushroom':(.60,.25,.56),'toy-pumpkin':(.94,.42,.12),'toy-petal':(.99,.88,.60),
                   'toy-crystal':(.43,.72,.85)}.items():mat(name,color,rough=.85)

# Rounded boxes retain exact bounding dimensions. A taller intermediate shape
# allows broad plan-view corners while keeping a gently rounded shallow top.
def softbox(name,loc,dimensions,material,radius=.08,segments=3):
    return cube(name,loc,dimensions,material,radius) if segments==2 else roundedbox(name,loc,dimensions,material,radius,segments)
def roundedbox(name,loc,dimensions,material,radius,segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o=add(bpy.context.object,name,loc,dimensions,material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Soft rounded toy edges','BEVEL');mod.width=radius;mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons:p.use_smooth=True
    normal=o.modifiers.new('Weighted toy normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
    bpy.ops.object.modifier_apply(modifier=normal.name)
    return o

def roundrod(name,a,b,r,material):
    o=rod(name,a,b,r,material)
    for p in o.data.polygons:p.use_smooth=True
    uv(name+' soft end',a,(r,r,r),material,12,8)
    uv(name+' soft end',b,(r,r,r),material,12,8)
    return o

def flatten(o,factor):
    # Apply after roundedbox bevel to retain wide corners in the horizontal plane.
    for v in o.data.vertices:v.co.z*=factor
    return o

def leaf(loc,scale,material='toy-leaf-light'):
    return uv('Padded foliage lobe',loc,scale,material,24,14)

def tree(apple=False):
    roundrod('Warm smooth trunk',(0,0,.12),(.03,.01,1.65),.12,'toy-bark')
    for sign in [-1,1]:roundrod('Rounded branch',(.02,0,.85),(sign*.45,.015,1.6),.066,'toy-bark')
    lobes=[((-.43,.03,1.55),(.51,.49,.53),'toy-leaf'),((.43,.03,1.58),(.50,.48,.51),'toy-leaf-light'),
           ((0,.18,1.84),(.62,.52,.61),'toy-leaf'),((-.22,-.22,1.90),(.50,.48,.55),'toy-leaf-light'),
           ((.24,-.17,2.05),(.45,.43,.51),'toy-leaf-lime')]
    for loc,sc,m in lobes:leaf(loc,sc,m)
    if apple:
        for i in range(9):
            a=i*2.4;z=1.4+(i%3)*.25;x=.73*math.cos(a);y=.55*math.sin(a)
            uv('Round red apple',(x,y,z),(.105,.10,.105),'toy-berry',12,8)
            rod('Apple stem',(x,y,z+.07),(x+.01,y,z+.12),.012,'toy-bark')
    else:
        # Broad oval leaf accents read as soft embroidered patches, not facets.
        for loc,sc in [((-.43,-.41,1.78),(.13,.032,.07)),((.28,-.54,1.95),(.12,.03,.06))]:uv('Leaf patch',loc,sc,'toy-leaf-lime',12,8)

assets={}
reset();tree();assets['tree']=export('tree')
reset();tree(True);assets['apple-tree']=export('apple-tree')
reset()
for loc,sc,m in [((0,0,.30),(.45,.37,.35),'toy-leaf-light'),((-.32,.025,.21),(.31,.29,.25),'toy-leaf'),((.31,0,.23),(.32,.28,.27),'toy-leaf-lime')]:leaf(loc,sc,m)
assets['bush']=export('bush')

reset()
uv('Soft river pebble',(0,0,.22),(.48,.36,.28),'toy-stone',20,12)
# The broad base sits on the ground without angular spikes.
for obj in parts:
    for v in obj.data.vertices:
        if v.co.z < -.75:v.co.z=-.75+(v.co.z+.75)*.15
assets['rock']=export('rock')

reset();roundrod('Soft flower stem',(0,0,.016),(0,0,.30),.022,'leaf')
uv('Little leaf',(.075,0,.16),(.11,.045,.035),'toy-leaf-light',12,8)
for i in range(6):
    a=i*math.tau/6;o=uv('Plump flower petal',(.092*math.cos(a),.092*math.sin(a),.32),(.095,.061,.038),'toy-petal',12,8);o.rotation_euler.z=a
uv('Pollen button',(0,0,.344),(.066,.066,.043),'gold',16,10)
assets['flower']=export('flower')

reset();uv('Squishy mushroom stem',(0,0,.17),(.065,.065,.17),'cream',16,10)
uv('Plush mushroom cap',(0,0,.30),(.225,.225,.128),'toy-mushroom',20,12)
for x,y,z in [(-.10,-.02,.406),(.07,-.10,.407),(.065,.105,.402),(-.065,.10,.409)]:uv('Cap cream dot',(x,y,z),(.035,.035,.014),'white',12,8)
assets['mushroom']=export('mushroom')

reset()
for i in range(9):
    a=i*math.tau/9;uv('Soft pumpkin rib',(.115*math.cos(a),.115*math.sin(a),.225),(.172,.17,.22),'toy-pumpkin',16,10)
roundrod('Curled pumpkin stem',(0,0,.40),(.035,0,.51),.032,'toy-bark')
uv('Pumpkin leaf',(.105,.015,.446),(.11,.065,.029),'toy-leaf-light',12,8)
assets['pumpkin']=export('pumpkin')

reset()
for x in [-.45,.45]:
    roundedbox('Round fence post',(x,0,.30),(.115,.12,.60),'toy-bark',.045)
    uv('Fence post cap',(x,0,.59),(.067,.071,.065),'toy-cream',12,8)
for z in [.22,.44]:roundedbox('Painted rounded fence rail',(0,-.008,z),(1,.085,.095),'toy-cream',.037)
assets['fence']=export('fence')

reset()
# A bevelled jewel keeps readable facets while losing razor-sharp toy edges.
cone('Soft crystal point',(0,0,.47),.23,.015,.68,'toy-crystal',6)
cone('Soft crystal base',(0,0,.095),.14,.23,.19,'toy-crystal',6)
for obj in list(parts):
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    mod=obj.modifiers.new('Rounded crystal corners','BEVEL');mod.width=.025;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:p.use_smooth=True
    mod=obj.modifiers.new('Soft facet normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)
assets['crystal']=export('crystal')

# Unit blocks remain centered unit cubes: renderer scales each axis independently.
for name,material in [('ground','grass'),('path','path'),('water','toy-water')]:
    reset();roundedbox('Rounded '+name,(0,0,0),(1,1,1),material,.025,3);assets[name]=export(name)
reset()
o=roundedbox('Pillowy path stone',(0,0,.05),(.70,1.38,.28),'path',.12,5)
flatten(o,.10/.28)
assets['path-tile']=export('path-tile')

# Cottage: rounded walls, curved continuous roof, arched door and soft windows.
def arch(name,center,width,height,depth,material):
    x,y,z=center;r=width/2;spring=height-r
    poly=[(-r,0),(r,0),(r,spring)]
    for i in range(1,17):
        a=i*math.pi/16;poly.append((r*math.cos(a),spring+r*math.sin(a)))
    verts=[(x+px,y+dy,z+pz) for dy in [-depth/2,depth/2] for px,pz in poly]
    n=len(poly);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    for i in range(n):j=(i+1)%n;faces.append((i,j,j+n,i+n))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);add(o,name,(0,0,0),(1,1,1),material)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bevel=o.modifiers.new('Soft arch edge','BEVEL');bevel.width=.018;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
    for p in o.data.polygons:p.use_smooth=True
    normal=o.modifiers.new('Soft arch normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=normal.name);o.select_set(False)
    return o

reset()
roundedbox('Soft cottage walls',(0,0,.57),(1.5,1.25,1.14),'toy-cream',.16,5)
# Sweeping roof cross-section, front-to-back, with rounded eaves and ridge.
section=[(-.92,1.07),(-.82,1.16),(-.62,1.34),(-.34,1.57),(-.10,1.74),(0,1.77),(.10,1.74),(.34,1.57),(.62,1.34),(.82,1.16),(.92,1.07)]
profile=section+[(x,z-.13) for x,z in reversed(section)]
vertices=[(x,y,z) for y in [-.77,.77] for x,z in profile];n=len(profile)
# Explicit narrow quads prevent a concave cap n-gon covering the gable.
faces=[];top_count=len(section)
for i in range(top_count-1):
    cap=(i,i+1,n-2-i,n-1-i);faces.append(tuple(reversed(cap)));faces.append(tuple(index+n for index in cap))
for i in range(n):j=(i+1)%n;faces.append((i,j,j+n,i+n))
mesh=bpy.data.meshes.new('Curved cottage roof');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('Curved cottage roof',mesh);bpy.context.collection.objects.link(obj);add(obj,obj.name,(0,0,0),(1,1,1),'toy-roof')
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
mod=obj.modifiers.new('Rounded roof edges','BEVEL');mod.width=.055;mod.segments=4;bpy.ops.object.modifier_apply(modifier=mod.name)
for p in obj.data.polygons:p.use_smooth=True
mod=obj.modifiers.new('Soft roof normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
# Trim follows the curved front eave like a stitched toy seam.
for i in range(len(section)-1):
    x,z=section[i];xx,zz=section[i+1];rod('Soft roof trim',(x,-.784,z-.035),(xx,-.784,zz-.035),.027,'toy-roof-light')
for x,z in section:uv('Rounded trim join',(x,-.784,z-.035),(.028,.028,.028),'toy-roof-light',10,6)
# Closed upper gable fills the space beneath the curved roof.
gable=[(-.75,1.01),(.75,1.01),(.70,1.22),(.42,1.47),(.15,1.66),(0,1.69),(-.15,1.66),(-.42,1.47),(-.70,1.22)]
vertices=[(x,y,z) for y in [-.605,.605] for x,z in gable];n=len(gable)
faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
for i in range(n):j=(i+1)%n;faces.append((i,i+n,j+n,j))
mesh=bpy.data.meshes.new('Closed cottage gable');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('Closed cream gable',mesh);bpy.context.collection.objects.link(obj);add(obj,obj.name,(0,0,0),(1,1,1),'toy-cream')
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
mod=obj.modifiers.new('Soft gable edges','BEVEL');mod.width=.045;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
for p in obj.data.polygons:p.use_smooth=True
mod=obj.modifiers.new('Weighted gable normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
uv('Round attic window',(0,-.646,1.355),(.12,.025,.12),'toy-window',20,12)
o=torus('Cream attic window trim',(0,-.645,1.355),.13,.023,'white');o.rotation_euler.x=math.pi/2
arch('Door cream surround',(0,-.635,.025),.48,.84,.075,'gold')
arch('Arched walnut door',(0,-.685,.036),.385,.73,.066,'toy-door')
uv('Round brass doorknob',(.105,-.731,.35),(.029,.026,.029),'gold',12,8)
for x in [-.49,.49]:
    roundedbox('Window cream surround',(x,-.632,.67),(.34,.065,.37),'white',.11,4)
    roundedbox('Blue rounded window',(x,-.674,.67),(.26,.036,.29),'toy-window',.085,4)
    roundrod('Window crossbar',(x-.10,-.702,.67),(x+.10,-.702,.67),.012,'toy-cream')
    roundrod('Window mullion',(x,-.702,.565),(x,-.702,.775),.012,'toy-cream')
roundedbox('Cottage chimney',(.44,.24,1.62),(.24,.27,.60),'toy-cream',.07,4)
roundedbox('Rounded chimney cap',(.44,.24,1.92),(.31,.33,.10),'toy-roof',.043,4)
assets['house']=export('house')

# A cheerful miniature garden presentation, rendered using the same lighting as portraits.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.55,.61,.57);scene.view_settings.view_transform='AgX'
def place(name,loc,scale=(1,1,1),rot=0):
    src=assets[name];obj=src.copy();obj.data=src.data;bpy.context.collection.objects.link(obj);obj.hide_render=False;obj.hide_set(False);obj.location=loc;obj.scale=Vector(obj.scale)*Vector(scale);obj.rotation_euler.z=rot;return obj
place('ground',(0,0,-.21),(7,5.1,.4))
place('house',(.10,1.0,0),(1.2,1.2,1.2))
place('tree',(-2.45,.98,0));place('apple-tree',(2.3,1,0),(.95,.95,.95))
for i in range(7):place('path-tile',(-2.52+i*.84,-.80,.01),(1.10,1,1))
for x,y in [(-2.3,-1.86),(-1.9,-1.7),(1.0,-1.7),(1.8,-1.8)]:place('bush',(x,y,0),(.7,.7,.7))
for x,y in [(-1.45,.65),(1.3,.70)]:place('fence',(x,y,0))
place('water',(2.15,-1.62,.013),(1.1,.57,.06))
place('rock',(-.98,-1.72,0),(.85,.85,.85));place('rock',(2.45,-1.52,0),(.55,.55,.55))
place('pumpkin',(.22,-1.82,0),(1.1,1.1,1.1));place('mushroom',(-1.15,.20,0),(1.3,1.3,1.3));place('crystal',(1.15,-1.89,0),(.75,.75,.75))
for x,y in [(-2.87,-1.85),(-.57,-1.80),(1.32,-.01),(2.83,.1),(-1.91,.25)]:place('flower',(x,y,0),(1.2,1.2,1.2))
for name,loc,power,size in [('Warm softbox',(-4,-5,8),700,5),('Cool fill',(5,-1,5),450,5),('Rim light',(1,5,7),850,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.6))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(6,-10,8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.60))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=9.2;scene.camera=cam
import sys
if '--closeup' in sys.argv:
    cam.location=(3,-6,3.8);cam.rotation_euler=(Vector((.1,1,1.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.8
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.cycles.samples=16
    scene.render.filepath=os.path.join(ROOT,'art','cottage-preview.png')
else:
    scene.render.filepath=os.path.join(ROOT,'art','environment-preview.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','environment.blend'),compress=True)
print('GNOMEWARD_ROUNDED_ENVIRONMENT_COMPLETE')
