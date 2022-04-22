var myLayout = new GoldenLayout({
    content: [{
      type: 'row',
      content:[{
        type:'react-component',
        component: 'test-component',
        props: { label: 'A' }
      },{
        type: 'column',
        content:[{
          type:'react-component',
          component: 'test-component',
          props: { label: 'B' }
        },{
          type:'react-component',
          component: 'test-component',
          props: { label: 'C' }
        }]
      }]
    }]
  });
 
 var TestComponent = function(props) {
     return React.createElement('h1', null, props.label);
   }
 
 myLayout.registerComponent('test-component', TestComponent );
 
 //Once all components are registered, call
 myLayout.init();